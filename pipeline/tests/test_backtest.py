"""Walk-forward mechanics on SYNTHETIC SAMPLE DATA."""

from datetime import date, timedelta

import numpy as np
import pandas as pd
import pytest

from epf.features.build import META_COLUMNS
from epf.models import backtest, lgbm


@pytest.fixture(scope="module", autouse=True)
def small_models():
    """Small models keep this file fast. The harness is under test here, not model quality."""
    small = {**lgbm.PARAMS, "n_estimators": 60, "learning_rate": 0.1, "n_jobs": 2}
    with pytest.MonkeyPatch.context() as mp:
        mp.setattr(lgbm, "PARAMS", small)
        yield


def _data(days=200, seed=1) -> pd.DataFrame:
    rng = np.random.default_rng(seed)
    start = date(2025, 1, 1)
    rows = []
    for i in range(days):
        day = start + timedelta(days=i)
        for hour in range(24):
            signal = rng.normal()
            rows.append(
                {
                    "delivery_date": day,
                    "valid_from_utc": pd.Timestamp(day) + pd.Timedelta(hours=hour),
                    "cutoff_utc": pd.Timestamp(day) - pd.Timedelta(hours=12),
                    "max_input_available_at_utc": pd.Timestamp(day) - pd.Timedelta(hours=13),
                    "weather_run_utc": pd.Timestamp(day) - pd.Timedelta(days=1),
                    "hour": hour,
                    "day_hours": 24,
                    "signal": signal,
                    "price_lag_1d": rng.normal(50, 20),
                    "price_lag_7d": rng.normal(50, 20),
                    "y": 50 + 20 * signal + rng.normal(scale=2),
                }
            )
    return pd.DataFrame(rows)


@pytest.fixture(scope="module")
def run():
    data = _data()
    start, end = date(2025, 6, 1), date(2025, 7, 19)
    predictions, importance, version = backtest.walk_forward(data, start, end)
    predictions = predictions.merge(data[["valid_from_utc", "day_hours"]], on="valid_from_utc")
    return data, backtest.baseline_intervals(data, predictions), importance, version


def test_training_never_includes_test_period(run):
    _, predictions, _, _ = run
    assert (predictions["trained_through"] < predictions["delivery_date"]).all()
    june = predictions[predictions["delivery_date"] < date(2025, 7, 1)]
    july = predictions[predictions["delivery_date"] >= date(2025, 7, 1)]
    assert set(june["trained_through"]) == {date(2025, 5, 31)}
    assert set(july["trained_through"]) == {date(2025, 6, 30)}


def test_window_respected(run):
    _, predictions, _, _ = run
    assert predictions["delivery_date"].min() == date(2025, 6, 1)
    assert predictions["delivery_date"].max() == date(2025, 7, 19)


def test_quantiles_do_not_cross(run):
    _, predictions, _, _ = run
    assert (predictions["p10"] <= predictions["p50"]).all()
    assert (predictions["p50"] <= predictions["p90"]).all()


def test_model_finds_real_signal_and_beats_noise_baselines(run):
    _, predictions, importance, _ = run
    results = backtest.score(predictions)
    assert results["model"]["mae"] < results["baseline_prev_day"]["mae"]
    assert importance.index[0] == "signal"
    assert 60 < results["model"]["coverage_p10_p90"] < 95


def test_no_usable_signal_gives_large_error():
    """The harness should not produce a good score when no feature explains the target."""
    data = _data(seed=2)
    data["signal"] = np.random.default_rng(3).normal(size=len(data))
    predictions, _, _ = backtest.walk_forward(data, date(2025, 6, 1), date(2025, 7, 19))
    # The target still holds the original signal, which this feature no longer explains.
    assert (predictions["y"] - predictions["p50"]).abs().mean() > 10


def test_baseline_interval_uses_only_past_errors(run):
    data, predictions, _, _ = run
    row = predictions.iloc[0]
    history = data[(data["hour"] == row["hour"]) & (data["delivery_date"] < row["delivery_date"])]
    history = history[history["delivery_date"] >= row["delivery_date"] - timedelta(days=90)]
    errors = history["y"] - history["price_lag_1d"]
    assert row["baseline_prev_day_p10"] == pytest.approx(
        row["baseline_prev_day"] + np.quantile(errors, 0.1)
    )


def test_feature_columns_exclude_metadata_and_target(run):
    _, _, importance, _ = run
    assert not set(importance.index) & {*META_COLUMNS, "y"}


def test_model_version_changes_with_features():
    assert lgbm.model_version(["a"]) != lgbm.model_version(["a", "b"])
    assert lgbm.model_version(["a", "b"]) == lgbm.model_version(["b", "a"])


def test_report_structure_and_verdict(run):
    _, predictions, importance, version = run
    report = backtest.build_report(
        predictions, importance, version, date(2025, 6, 1), date(2025, 7, 19), date(2025, 1, 1), 5
    )
    assert report["kind"] == "backtest"
    assert set(report["overall"]) == {"model", "baseline_prev_day", "baseline_prev_week"}
    assert report["significance"]["baseline_prev_day"]["verdict"] == "model better"
    assert report["by_regime"]["all"]["model"]["n"] == report["overall"]["model"]["n"]
