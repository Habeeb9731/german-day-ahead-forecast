from datetime import date, datetime, timedelta

import pandas as pd
import pytest

from epf.clean.smard import available_at
from epf.config import SERIES_BY_ID
from epf.quality.checks import missing_intervals
from epf.timeutil import delivery_bounds_utc, delivery_date, delivery_hours, local_time_on


@pytest.mark.parametrize(
    ("day", "hours"),
    [
        (date(2026, 3, 29), 23),
        (date(2026, 10, 25), 25),
        (date(2026, 6, 15), 24),
        (date(2025, 10, 26), 25),
        (date(2024, 3, 31), 23),
    ],
)
def test_delivery_hours(day, hours):
    assert delivery_hours(day) == hours


def test_delivery_bounds_on_dst_days():
    assert delivery_bounds_utc(date(2026, 3, 29)) == (
        datetime(2026, 3, 28, 23),
        datetime(2026, 3, 29, 22),
    )
    assert delivery_bounds_utc(date(2026, 10, 25)) == (
        datetime(2026, 10, 24, 22),
        datetime(2026, 10, 25, 23),
    )


def test_repeated_local_hour_maps_to_one_delivery_date():
    # 02:00-03:00 Berlin happens twice on 2026-10-25; both are 00:00 and 01:00 UTC.
    assert delivery_date(datetime(2026, 10, 25, 0)) == date(2026, 10, 25)
    assert delivery_date(datetime(2026, 10, 25, 1)) == date(2026, 10, 25)
    assert delivery_date(datetime(2026, 10, 24, 21)) == date(2026, 10, 24)


def test_local_rule_time_follows_utc_offset():
    assert local_time_on(date(2026, 1, 15), 10, 15) == datetime(2026, 1, 15, 9, 15)
    assert local_time_on(date(2026, 7, 15), 10, 15) == datetime(2026, 7, 15, 8, 15)


@pytest.mark.parametrize("day", [date(2026, 3, 29), date(2026, 10, 25)])
def test_no_gap_reported_on_complete_dst_day(day):
    start, end = delivery_bounds_utc(day)
    grid = pd.Series(pd.date_range(start, end - timedelta(hours=1), freq="60min"))
    assert len(grid) == delivery_hours(day)
    assert missing_intervals(grid, 60).empty


def test_missing_hour_on_dst_day_is_found():
    start, end = delivery_bounds_utc(date(2026, 10, 25))
    grid = pd.date_range(start, end - timedelta(hours=1), freq="60min")
    assert list(missing_intervals(pd.Series(grid.delete(3)), 60)) == [grid[3]]


def test_availability_uses_day_before_across_dst_change():
    # Delivery 2026-03-29 (23 hours). The day before is still CET, so 10:15 is 09:15 UTC.
    valid = pd.Series(pd.to_datetime(["2026-03-28 23:00", "2026-03-29 21:00"]))
    result = available_at(SERIES_BY_ID["load_forecast"], valid, 60)
    assert list(result) == [pd.Timestamp("2026-03-28 09:15")] * 2
    # Delivery 2026-10-25 (25 hours). The day before is still CEST, so 10:15 is 08:15 UTC.
    valid = pd.Series(pd.to_datetime(["2026-10-24 22:00", "2026-10-25 22:00"]))
    result = available_at(SERIES_BY_ID["load_forecast"], valid, 60)
    assert list(result) == [pd.Timestamp("2026-10-24 08:15")] * 2
