"""Quality check behaviour. All values are SYNTHETIC SAMPLE DATA."""

from datetime import date, datetime

import pandas as pd
import pytest

from epf.config import SERIES_BY_ID
from epf.quality import checks

PRICE = SERIES_BY_ID["price_da_60"]
LOAD = SERIES_BY_ID["load_forecast"]
WIND_FC = SERIES_BY_ID["wind_on_forecast"]
LOAD_ACT = SERIES_BY_ID["load_actual"]


def frame(start, values, freq="60min"):
    return pd.DataFrame(
        {
            "valid_from_utc": pd.date_range(start, periods=len(values), freq=freq),
            "value": values,
        }
    )


def test_gap_is_error_for_critical_and_warning_otherwise():
    df = frame("2026-06-01", [50.0] * 5).drop(index=2)
    assert checks.check_missing(df, PRICE)[0].severity == "error"
    assert checks.check_missing(df, WIND_FC)[0].severity == "warning"
    assert checks.check_missing(df, PRICE)[0].count == 1


def test_no_issue_for_complete_series():
    assert checks.check_missing(frame("2026-06-01", [50.0] * 48), PRICE) == []


def test_duplicates_detected():
    df = frame("2026-06-01", [1.0, 2.0])
    assert checks.check_duplicates(pd.concat([df, df.iloc[[0]]]), PRICE)[0].count == 1


def test_negative_prices_are_not_flagged():
    assert checks.check_range(frame("2026-06-01", [-499.9, -5.0, 0.0]), PRICE) == []


def test_out_of_range_values_flagged():
    assert checks.check_range(frame("2026-06-01", [-600.0, 80.0]), PRICE)[0].count == 1
    assert checks.check_range(frame("2026-06-01", [5_000.0]), LOAD)[0].severity == "error"


def test_frozen_feed_flagged():
    df = frame("2026-06-01", [50_000.0] * checks.FROZEN_HOURS)
    assert checks.check_frozen(df, LOAD)[0].count == checks.FROZEN_HOURS
    assert checks.check_frozen(frame("2026-06-01", [1.0, 2.0]), LOAD) == []


@pytest.mark.parametrize(
    ("now", "series", "expected"),
    [
        # Summer: 10:15 Berlin is 08:15 UTC.
        (datetime(2026, 6, 15, 8, 0), LOAD, date(2026, 6, 15)),
        (datetime(2026, 6, 15, 8, 30), LOAD, date(2026, 6, 16)),
        # Prices are due by 20:00 Berlin (18:00 UTC in summer).
        (datetime(2026, 6, 15, 17, 59), PRICE, date(2026, 6, 15)),
        (datetime(2026, 6, 15, 18, 0), PRICE, date(2026, 6, 16)),
        # Winter: 20:00 Berlin is 19:00 UTC.
        (datetime(2026, 1, 15, 18, 30), PRICE, date(2026, 1, 15)),
        (datetime(2026, 6, 15, 12), LOAD_ACT, None),
    ],
)
def test_expected_last_delivery(now, series, expected):
    assert checks.expected_last_delivery(series, now) == expected


def test_stale_price_fails_after_it_is_due():
    # Data through 2026-06-15 (Berlin); at 19:00 UTC the next day's prices are overdue.
    df = frame("2026-06-14 22:00", [80.0] * 24)
    now = datetime(2026, 6, 15, 19)
    assert checks.check_stale(df, PRICE, now)[0].severity == "error"
    assert checks.check_stale(df, PRICE, datetime(2026, 6, 15, 10)) == []


def test_stale_handles_25_hour_day():
    # Delivery 2026-10-25 has 25 hours; 24 hours of data is one hour short.
    start = datetime(2026, 10, 24, 22)
    now = datetime(2026, 10, 24, 20)  # after 20:00 Berlin the day before
    assert checks.check_stale(frame(start, [80.0] * 25), PRICE, now) == []
    assert len(checks.check_stale(frame(start, [80.0] * 24), PRICE, now)) == 1


def test_stale_actuals_warn_only():
    df = frame("2026-06-14", [50_000.0] * 24)
    issue = checks.check_stale(df, LOAD_ACT, datetime(2026, 6, 16))[0]
    assert issue.severity == "warning"


def test_empty_series_is_stale():
    empty = pd.DataFrame({"valid_from_utc": pd.to_datetime([]), "value": []})
    assert checks.check_stale(empty, PRICE, datetime(2026, 6, 15))[0].severity == "error"


def test_price_consistency():
    hourly = frame("2026-01-01", [10.0, 20.0])
    quarters = frame("2026-01-01", [8, 9, 11, 12, 20, 20, 20, 20.0], freq="15min")
    assert checks.check_price_consistency(hourly, quarters) == []
    hourly.loc[1, "value"] = 25.0
    assert checks.check_price_consistency(hourly, quarters)[0].count == 1


def test_weather_stale_and_fallback(con):
    now = datetime(2026, 6, 15, 9)
    assert checks.check_weather(con, now)[0].severity == "error"
    con.execute(
        "INSERT INTO weather_run VALUES (?, ?, 'berlin', 'temperature_2m', 1.0, ?, 1)",
        [datetime(2026, 6, 14), datetime(2026, 6, 14), datetime(2026, 6, 14, 6)],
    )
    assert checks.check_weather(con, now)[0].check == "stale"
    # Before the 00 UTC run is due, the previous evening's 18 UTC run is enough.
    early = datetime(2026, 6, 15, 3)
    con.execute(
        "INSERT INTO weather_run VALUES (?, ?, 'berlin', 'temperature_2m', 1.0, ?, 1)",
        [datetime(2026, 6, 14, 18), datetime(2026, 6, 14, 18), datetime(2026, 6, 15, 0)],
    )
    assert [i.check for i in checks.check_weather(con, early)] == []
