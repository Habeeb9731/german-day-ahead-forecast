"""Leakage prevention. All values are SYNTHETIC SAMPLE DATA.

The fixture holds values for every series across all days, including ones that must stay hidden.
Tests then change or poison post-cutoff data and confirm that the features do not move.
"""

from datetime import date, datetime, timedelta

import numpy as np
import pandas as pd
import pytest

from epf.clean.smard import available_at
from epf.config import ACTUAL_DELAY_HOURS, SERIES_BY_ID, WEATHER_LOCATIONS, WEATHER_VARIABLES
from epf.features.asof import AsOf, DataStore, LeakageError, cutoff_for
from epf.features.build import build_day, feature_columns, same_hour
from epf.timeutil import delivery_bounds_utc

DELIVERY = date(2026, 6, 17)
SERIES_IDS = [s for s in SERIES_BY_ID if s != "price_da_15"]
rng = np.random.default_rng(7)


def _series(series_id: str, start="2026-05-01", end="2026-06-20") -> pd.DataFrame:
    valid = pd.Series(pd.date_range(start, end, freq="60min", inclusive="left"))
    return pd.DataFrame(
        {
            "valid_from_utc": valid,
            "value": rng.uniform(100, 500, len(valid)),
            "available_at_utc": available_at(SERIES_BY_ID[series_id], valid, 60),
        }
    )


def _weather(runs) -> pd.DataFrame:
    rows = []
    for run in runs:
        for h in range(54):
            valid = run + timedelta(hours=h)
            for loc in WEATHER_LOCATIONS:
                for var in WEATHER_VARIABLES:
                    rows.append((run, valid, loc.name, var, 5.0 + h, run + timedelta(hours=6)))
    return pd.DataFrame(
        rows, columns=["run_utc", "valid_utc", "location", "variable", "value", "available_at_utc"]
    )


RUNS = [
    datetime(2026, 6, 15, 18),
    datetime(2026, 6, 16),
    datetime(2026, 6, 16, 6),
    datetime(2026, 6, 17),
]


@pytest.fixture
def parts():
    series = {s: _series(s) for s in SERIES_IDS}
    holidays = pd.DataFrame(
        {
            "holiday_date": [date(2026, 12, 25)],
            "name": ["x"],
            "is_national": [True],
            "state_share": [1.0],
        }
    )
    return series, _weather(RUNS), holidays


def _store(parts) -> DataStore:
    return DataStore(*parts)


def _features(frame: pd.DataFrame) -> pd.DataFrame:
    return frame[feature_columns(frame)]


def test_cutoff_is_before_auction_in_both_seasons():
    assert cutoff_for(date(2026, 6, 17)) == datetime(2026, 6, 16, 9, 30)  # CEST
    assert cutoff_for(date(2026, 1, 15)) == datetime(2026, 1, 14, 10, 30)  # CET
    # Delivery on a DST change day: the cutoff is on the previous day, at its own offset.
    assert cutoff_for(date(2026, 3, 29)) == datetime(2026, 3, 28, 10, 30)
    assert cutoff_for(date(2026, 10, 25)) == datetime(2026, 10, 24, 9, 30)


def test_no_input_is_newer_than_cutoff(parts):
    out = build_day(_store(parts), DELIVERY)
    assert (out["max_input_available_at_utc"] <= out["cutoff_utc"]).all()


def test_features_ignore_changes_after_cutoff(parts):
    """The core guarantee: any value not yet available can change without moving a feature."""
    baseline = build_day(_store(parts), DELIVERY)
    cutoff = pd.Timestamp(cutoff_for(DELIVERY))
    series, weather, holidays = parts
    poisoned = {}
    for sid, df in series.items():
        df = df.copy()
        df.loc[df["available_at_utc"] > cutoff, "value"] = 9e9
        poisoned[sid] = df
    weather = weather.copy()
    weather.loc[weather["available_at_utc"] > cutoff, "value"] = 9e9
    out = build_day(DataStore(poisoned, weather, holidays), DELIVERY)
    pd.testing.assert_frame_equal(_features(baseline), _features(out))
    assert (out[feature_columns(out)].select_dtypes("number").abs() < 1e9).all().all()


@pytest.mark.parametrize("sid", SERIES_IDS)
def test_every_series_can_only_add_rows_before_cutoff(parts, sid):
    """Removing a series' post-cutoff rows entirely must not change anything either."""
    baseline = build_day(_store(parts), DELIVERY)
    cutoff = pd.Timestamp(cutoff_for(DELIVERY))
    series, weather, holidays = parts
    trimmed = dict(series)
    trimmed[sid] = series[sid].loc[series[sid]["available_at_utc"] <= cutoff]
    out = build_day(DataStore(trimmed, weather, holidays), DELIVERY)
    pd.testing.assert_frame_equal(_features(baseline), _features(out))


def test_delivery_day_price_cannot_be_read(parts):
    start, end = delivery_bounds_utc(DELIVERY)
    view = AsOf(_store(parts), cutoff_for(DELIVERY))
    assert view.series("price_da_60", start, end).empty


def test_previous_day_price_is_readable(parts):
    start, end = delivery_bounds_utc(DELIVERY - timedelta(days=1))
    view = AsOf(_store(parts), cutoff_for(DELIVERY))
    assert len(view.series("price_da_60", start, end)) == 24


def test_delivery_day_demand_forecast_is_readable_at_cutoff(parts):
    start, end = delivery_bounds_utc(DELIVERY)
    view = AsOf(_store(parts), cutoff_for(DELIVERY))
    assert len(view.series("load_forecast", start, end)) == 24


@pytest.mark.parametrize("sid", ["wind_on_forecast", "wind_off_forecast", "pv_forecast"])
def test_delivery_day_renewable_forecast_cannot_be_read(parts, sid):
    start, end = delivery_bounds_utc(DELIVERY)
    assert AsOf(_store(parts), cutoff_for(DELIVERY)).series(sid, start, end).empty


@pytest.mark.parametrize("sid", ["load_actual", "wind_on_actual", "pv_actual", "residual_actual"])
def test_actuals_stop_before_cutoff(parts, sid):
    cutoff = cutoff_for(DELIVERY)
    start, end = delivery_bounds_utc(DELIVERY)
    rows = AsOf(_store(parts), cutoff).series(sid, start - timedelta(days=2), end)
    last_end = rows["valid_from_utc"].max() + timedelta(hours=1 + ACTUAL_DELAY_HOURS)
    assert last_end <= pd.Timestamp(cutoff)


def test_weather_uses_00_utc_run_from_day_before(parts):
    out = build_day(_store(parts), DELIVERY)
    assert (out["weather_run_utc"] == pd.Timestamp("2026-06-16 00:00")).all()
    # Lead time from the run to delivery spans roughly 22-46 hours in summer.
    assert out["wx_lead_hours"].min() == 22
    assert out["wx_lead_hours"].max() == 45


def test_later_runs_are_never_used_even_if_listed(parts):
    view = AsOf(_store(parts), cutoff_for(DELIVERY))
    # The 06 UTC run on D-1 is issued before the cutoff but is due only at 12:00 UTC, after it.
    assert view.weather_run([datetime(2026, 6, 16, 6)]) is None
    assert view.weather_run([datetime(2026, 6, 17)]) is None


def test_weather_falls_back_to_previous_evening_run(parts):
    series, weather, holidays = parts
    weather = weather[weather["run_utc"] != pd.Timestamp("2026-06-16 00:00")]
    out = build_day(DataStore(series, weather, holidays), DELIVERY)
    assert (out["weather_run_utc"] == pd.Timestamp("2026-06-15 18:00")).all()


def test_missing_weather_yields_nan_not_a_later_run(parts):
    series, weather, holidays = parts
    weather = weather[weather["run_utc"] >= pd.Timestamp("2026-06-16 06:00")]
    out = build_day(DataStore(series, weather, holidays), DELIVERY)
    assert out["weather_run_utc"].isna().all()
    assert out["wx_temperature_2m_mean"].isna().all()


def test_guard_detects_a_leak_introduced_by_feature_code(parts):
    """If feature code bypasses the filter, the audit trail catches it."""
    view = AsOf(_store(parts), cutoff_for(DELIVERY))
    view.max_available_at = view.cutoff + pd.Timedelta(minutes=1)
    with pytest.raises(LeakageError):
        view.assert_clean()


def test_row_with_future_availability_is_invisible_even_if_valid_time_is_old(parts):
    """Availability governs access, not valid time: a late-published old value stays hidden."""
    series, weather, holidays = parts
    df = series["load_actual"].copy()
    old = df["valid_from_utc"] == pd.Timestamp("2026-06-14 12:00")
    df.loc[old, "available_at_utc"] = pd.Timestamp("2026-06-30")
    start, end = delivery_bounds_utc(date(2026, 6, 14))
    series = {**series, "load_actual": df}
    rows = AsOf(DataStore(series, weather, holidays), cutoff_for(DELIVERY)).series(
        "load_actual", start, end
    )
    assert pd.Timestamp("2026-06-14 12:00") not in set(rows["valid_from_utc"])


def test_no_target_or_actual_price_columns_in_features(parts):
    out = build_day(_store(parts), DELIVERY)
    assert not [c for c in feature_columns(out) if c in {"price", "target", "y", "price_da_60"}]


def test_short_and_long_days_have_correct_rows(parts):
    series = {s: _series(s, "2026-02-01", "2026-11-01") for s in SERIES_IDS}
    _, _, holidays = parts
    weather = _weather([datetime(2026, 3, 28), datetime(2026, 10, 24)])
    store = DataStore(series, weather, holidays)
    short = build_day(store, date(2026, 3, 29))
    long = build_day(store, date(2026, 10, 25))
    assert len(short) == 23
    assert 2 not in set(short["hour"])
    assert len(long) == 25
    assert list(long["hour"]).count(2) == 2


def test_same_hour_lookup_across_dst():
    # 2026-03-29 has no 02:00. Asking for it falls forward to 03:00.
    table = {(date(2026, 3, 29), 1): 10.0, (date(2026, 3, 29), 3): 30.0}
    assert same_hour(table, date(2026, 3, 29), 2) == 30.0
    assert same_hour(table, date(2026, 3, 29), 1) == 10.0
    assert np.isnan(same_hour(table, date(2026, 3, 29), 7))
