"""Daily automation. All prices and forecasts here are SYNTHETIC SAMPLE DATA."""

import json
from datetime import date, datetime, timedelta

import numpy as np
import pandas as pd
import pytest

from epf.clean.smard import available_at
from epf.config import SERIES_BY_ID, WEATHER_LOCATIONS, WEATHER_VARIABLES
from epf.features.asof import DataStore
from epf.features.build import build_day, feature_columns
from epf.live import daily, export, forecast_log, score
from epf.models import artifact, calibrate, lgbm
from epf.timeutil import delivery_bounds_utc

DELIVERY = date(2026, 6, 17)
WINDOW = datetime(2026, 6, 16, 8, 30)  # 10:30 Berlin
LATE = datetime(2026, 6, 16, 9, 35)  # 11:35 Berlin, after the 11:30 cutoff
SERIES_IDS = [s for s in SERIES_BY_ID if s != "price_da_15"]
rng = np.random.default_rng(11)


def _series(sid: str, end="2026-06-20") -> pd.DataFrame:
    valid = pd.Series(pd.date_range("2026-04-01", end, freq="60min", inclusive="left"))
    return pd.DataFrame(
        {
            "valid_from_utc": valid,
            "value": rng.uniform(
                50_000 if "load" in sid else 10, 60_000 if "load" in sid else 90, len(valid)
            ),
            "available_at_utc": available_at(SERIES_BY_ID[sid], valid, 60),
        }
    )


def _weather(runs) -> pd.DataFrame:
    rows = [
        (run, run + timedelta(hours=h), loc.name, var, 5.0 + h, run + timedelta(hours=6))
        for run in runs
        for h in range(54)
        for loc in WEATHER_LOCATIONS
        for var in WEATHER_VARIABLES
    ]
    return pd.DataFrame(
        rows, columns=["run_utc", "valid_utc", "location", "variable", "value", "available_at_utc"]
    )


@pytest.fixture(scope="module")
def parts():
    holidays = pd.DataFrame(
        {
            "holiday_date": [date(2026, 12, 25)],
            "name": ["x"],
            "is_national": [True],
            "state_share": [1.0],
        }
    )
    days = [datetime(2026, 5, 10) + timedelta(days=i) for i in range(39)]
    return {s: _series(s) for s in SERIES_IDS}, _weather(days), holidays


@pytest.fixture(scope="module")
def store(parts):
    return DataStore(*parts)


@pytest.fixture(scope="module")
def model(store, tmp_path_factory):
    with pytest.MonkeyPatch.context() as mp:
        mp.setattr(calibrate, "HOLDOUT_DAYS", 7)
        mp.setattr(
            lgbm, "PARAMS", {**lgbm.PARAMS, "n_estimators": 10, "min_child_samples": 5, "n_jobs": 2}
        )
        frames = [build_day(store, date(2026, 5, 11) + timedelta(days=i)) for i in range(24)]
        data = pd.concat(frames, ignore_index=True)
        data["y"] = rng.uniform(10, 90, len(data))
        root = tmp_path_factory.mktemp("models")
        artifact.train_and_save(data, feature_columns(data.drop(columns=["y"])), root)
    return artifact.load_latest(root)


def test_publishes_one_forecast_in_the_window(tmp_path, store, model):
    decision = daily.run_forecast(WINDOW, tmp_path, store, model)
    assert decision.outcome == "published"
    assert decision.delivery == DELIVERY
    item = forecast_log.entries(tmp_path)[0].data
    assert item["generated_at_utc"] == "2026-06-16T08:30:00"
    assert item["model_version"] == model.version
    assert len(item["hours"]) == 24
    assert all(h["p10"] <= h["p50"] <= h["p90"] for h in item["hours"])


def test_never_overwrites_an_existing_forecast(tmp_path, store, model):
    daily.run_forecast(WINDOW, tmp_path, store, model)
    path = forecast_log.entry_path(tmp_path, DELIVERY)
    before = path.read_bytes()
    second = daily.run_forecast(WINDOW + timedelta(minutes=20), tmp_path, store, model)
    assert second.outcome == "already_logged"
    assert path.read_bytes() == before
    with pytest.raises(FileExistsError):
        forecast_log.append(tmp_path, DELIVERY, "ok", WINDOW, WINDOW, "x")


def test_waits_before_the_window(tmp_path, store, model):
    early = datetime(2026, 6, 16, 8, 0)  # 10:00 Berlin
    assert daily.run_forecast(early, tmp_path, store, model).outcome == "too_early"
    assert forecast_log.entries(tmp_path) == []


def test_window_follows_winter_time(tmp_path):
    winter_early = datetime(2026, 1, 15, 9, 0)  # 10:00 CET
    assert daily.run_forecast(winter_early, tmp_path, None, None).outcome == "too_early"


def test_late_run_records_missed_and_no_prices(tmp_path, store, model):
    decision = daily.run_forecast(LATE, tmp_path, store, model)
    assert decision.outcome == "missed" and decision.failed
    item = forecast_log.entries(tmp_path)[0].data
    assert item["status"] == "missed"
    assert item["hours"] == []


def test_failure_before_cutoff_leaves_day_open_for_retry(tmp_path, store, model):
    first = daily.run_forecast(WINDOW, tmp_path, store, model, failure="quality checks failed")
    assert first.outcome == "not_ready" and first.failed
    assert forecast_log.entries(tmp_path) == []
    assert (
        daily.run_forecast(WINDOW + timedelta(minutes=20), tmp_path, store, model).outcome
        == "published"
    )


def test_failure_at_final_run_is_recorded_with_reason(tmp_path):
    decision = daily.run_forecast(LATE, tmp_path, None, None, failure="SMARD unavailable")
    assert decision.outcome == "missed"
    assert forecast_log.entries(tmp_path)[0].data["reason"] == "SMARD unavailable"


def test_missing_demand_forecast_blocks_publication(tmp_path, parts, model):
    series, weather, holidays = parts
    start, _ = delivery_bounds_utc(DELIVERY)
    load = series["load_forecast"]
    gappy = {**series, "load_forecast": load[load["valid_from_utc"] != pd.Timestamp(start)]}
    decision = daily.run_forecast(WINDOW, tmp_path, DataStore(gappy, weather, holidays), model)
    assert decision.outcome == "not_ready"
    assert "demand" in decision.detail
    assert forecast_log.entries(tmp_path) == []


def test_missing_weather_blocks_publication(tmp_path, parts, model):
    series, weather, holidays = parts
    old = weather[weather["run_utc"] < pd.Timestamp("2026-06-01")]
    decision = daily.run_forecast(WINDOW, tmp_path, DataStore(series, old, holidays), model)
    assert decision.outcome == "not_ready"
    assert "weather" in decision.detail


def test_stale_prices_block_publication(tmp_path, parts, model):
    series, weather, holidays = parts
    prices = series["price_da_60"]
    stale = {**series, "price_da_60": prices[prices["valid_from_utc"] < pd.Timestamp("2026-06-14")]}
    decision = daily.run_forecast(WINDOW, tmp_path, DataStore(stale, weather, holidays), model)
    assert decision.outcome == "not_ready"
    assert "prices" in decision.detail


def test_chain_detects_edits_and_removals(tmp_path):
    for i in range(3):
        day = DELIVERY + timedelta(days=i)
        forecast_log.append(tmp_path, day, "ok", WINDOW, LATE, "v", hours=[{"p50": i}])
    assert forecast_log.verify(tmp_path) == 3
    first = forecast_log.entry_path(tmp_path, DELIVERY)
    original = first.read_text()
    first.write_text(original.replace('"p50": 0', '"p50": 9'))
    with pytest.raises(forecast_log.LogIntegrityError):
        forecast_log.verify(tmp_path)
    first.write_text(original)
    forecast_log.entry_path(tmp_path, DELIVERY + timedelta(days=1)).unlink()
    with pytest.raises(forecast_log.LogIntegrityError):
        forecast_log.verify(tmp_path)


def test_verify_rejects_forecast_made_after_cutoff(tmp_path):
    forecast_log.append(tmp_path, DELIVERY, "ok", LATE, WINDOW, "v")
    with pytest.raises(forecast_log.LogIntegrityError, match="after its cutoff"):
        forecast_log.verify(tmp_path)


def _prices(start="2026-06-01", end="2026-06-18", value=50.0) -> pd.DataFrame:
    valid = pd.date_range(start, end, freq="60min", inclusive="left")
    return pd.DataFrame({"valid_from_utc": valid, "value": value})


def test_scoring_waits_for_all_actuals_and_leaves_log_alone(tmp_path, store, model):
    daily.run_forecast(WINDOW, tmp_path, store, model)
    path = forecast_log.entry_path(tmp_path, DELIVERY)
    before = path.read_bytes()
    start, _ = delivery_bounds_utc(DELIVERY)
    partial = _prices(end=str(start + timedelta(hours=5)))
    assert score.score_entries(tmp_path, partial).empty
    scored = score.score_entries(tmp_path, _prices())
    assert len(scored) == 24
    assert (scored["actual"] == 50.0).all()
    assert (scored["baseline_prev_day"] == 50.0).all()
    assert path.read_bytes() == before


def test_missed_days_are_not_scored(tmp_path):
    forecast_log.append(tmp_path, DELIVERY, "missed", LATE, WINDOW, None, reason="x")
    assert score.score_entries(tmp_path, _prices()).empty


def test_rebuild_scores_is_idempotent(con, tmp_path, store, model):
    daily.run_forecast(WINDOW, tmp_path, store, model)
    assert score.rebuild_scores(con, tmp_path).empty
    assert score.rebuild_scores(con, tmp_path).empty


def test_export_matches_dashboard_contract(tmp_path, store, model):
    log_root, out = tmp_path / "log", tmp_path / "out"
    daily.run_forecast(WINDOW, log_root, store, model)
    assert export.export_tomorrow(log_root, out)
    tomorrow = json.loads((out / "tomorrow.json").read_text())
    assert set(tomorrow) == {
        "kind", "is_sample", "status", "delivery_date", "generated_at_utc", "cutoff_utc",
        "model_version", "hours",
    }  # fmt: skip
    assert tomorrow["is_sample"] is False
    assert set(tomorrow["hours"][0]) == {"valid_from_utc", "p10", "p50", "p90"}

    scored = score.score_entries(log_root, _prices())
    export.export_track_record(scored, out, WINDOW)
    track = json.loads((out / "track_record.json").read_text())
    assert track["kind"] == "live_track_record"
    assert set(track["hours"][0]) == {
        "valid_from_utc", "delivery_date", "p10", "p50", "p90", "actual", "baseline_prev_day",
        "baseline_prev_week", "model_version", "forecast_generated_at_utc",
    }  # fmt: skip


def test_export_handles_missing_baseline_as_null(tmp_path, store, model):
    log_root, out = tmp_path / "log", tmp_path / "out"
    daily.run_forecast(WINDOW, log_root, store, model)
    scored = score.score_entries(log_root, _prices(start="2026-06-16"))
    export.export_track_record(scored, out, WINDOW)
    assert (
        json.loads((out / "track_record.json").read_text())["hours"][0]["baseline_prev_week"]
        is None
    )


def test_export_keeps_a_missed_day_visible(tmp_path):
    log_root, out = tmp_path / "log", tmp_path / "out"
    forecast_log.append(log_root, DELIVERY, "missed", LATE, WINDOW, None, reason="x")
    export.export_tomorrow(log_root, out)
    tomorrow = json.loads((out / "tomorrow.json").read_text())
    assert tomorrow["status"] == "missed" and tomorrow["hours"] == []


def test_backtest_export_stays_labelled(tmp_path):
    report = tmp_path / "report.json"
    report.write_text(json.dumps({"kind": "backtest", "overall": {}}))
    assert export.export_backtest(report, tmp_path / "out")
    assert json.loads((tmp_path / "out" / "backtest.json").read_text())["kind"] == "backtest"
    report.write_text(json.dumps({"kind": "live_forecast"}))
    with pytest.raises(ValueError):
        export.export_backtest(report, tmp_path / "out")


def test_clear_sample_data_only_removes_sample_files(tmp_path):
    (tmp_path / "a.json").write_text('{"is_sample": true}')
    (tmp_path / "b.json").write_text('{"is_sample": false}')
    export.clear_sample_data(tmp_path)
    assert not (tmp_path / "a.json").exists()
    assert (tmp_path / "b.json").exists()


def test_saved_model_predicts_same_as_loaded(store, model):
    features = build_day(store, DELIVERY)
    out = model.predict(features)
    assert (out["p10"] <= out["p50"]).all() and (out["p50"] <= out["p90"]).all()
    assert model.trained_through == date(2026, 6, 3)
    assert "all" in model.adjustments
