"""Time helpers. All stored timestamps are naive UTC; Europe/Berlin is for delivery-day logic."""

from __future__ import annotations

from datetime import UTC, date, datetime, timedelta
from zoneinfo import ZoneInfo

import pandas as pd

BERLIN = ZoneInfo("Europe/Berlin")


def utcnow() -> datetime:
    """Current time as naive UTC, the storage convention used throughout."""
    return datetime.now(UTC).replace(tzinfo=None)


def to_utc_naive(dt: datetime) -> datetime:
    return dt.astimezone(UTC).replace(tzinfo=None)


def ms_to_utc(ms: int) -> datetime:
    return datetime.fromtimestamp(ms / 1000, UTC).replace(tzinfo=None)


def utc_to_ms(dt: datetime) -> int:
    return int(dt.replace(tzinfo=UTC).timestamp() * 1000)


def delivery_bounds_utc(day: date) -> tuple[datetime, datetime]:
    """UTC start (inclusive) and end (exclusive) of a Berlin delivery day."""
    next_day = day + timedelta(days=1)
    start = datetime(day.year, day.month, day.day, tzinfo=BERLIN)
    end = datetime(next_day.year, next_day.month, next_day.day, tzinfo=BERLIN)
    return to_utc_naive(start), to_utc_naive(end)


def delivery_hours(day: date) -> int:
    """Number of hours in a Berlin day: 23, 24 or 25."""
    start, end = delivery_bounds_utc(day)
    return int((end - start).total_seconds() // 3600)


def delivery_date(valid_utc: datetime) -> date:
    return valid_utc.replace(tzinfo=UTC).astimezone(BERLIN).date()


def local_time_on(day: date, hour: int, minute: int = 0) -> datetime:
    """Naive UTC instant of a Berlin wall-clock time on `day`."""
    return to_utc_naive(datetime(day.year, day.month, day.day, hour, minute, tzinfo=BERLIN))


def rule_day_before(valid_utc: pd.Series, hour: int, minute: int) -> pd.Series:
    """For each valid time, the UTC instant of hour:minute Berlin on the day before delivery."""
    local_days = valid_utc.dt.tz_localize("UTC").dt.tz_convert(BERLIN).dt.tz_localize(None)
    prior = local_days.dt.normalize() - pd.Timedelta(days=1)
    wall = prior + pd.Timedelta(hours=hour, minutes=minute)
    result: pd.Series = wall.dt.tz_localize(BERLIN).dt.tz_convert("UTC").dt.tz_localize(None)
    return result
