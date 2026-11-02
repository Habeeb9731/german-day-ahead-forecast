"""Data quality checks: missing intervals, duplicates, unexpected values and stale data.

Errors stop the pipeline; warnings are reported. Only `critical` series and the latest weather run
can raise errors. Negative prices are valid and only ever counted.
"""

from __future__ import annotations

import json
from dataclasses import asdict, dataclass
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Literal

import duckdb
import pandas as pd

from epf.config import (
    ACTUAL_DELAY_HOURS,
    PRICE_15MIN_START_UTC,
    RULE_DA_PRICE,
    RULE_LOAD_FORECAST,
    RULE_RES_FORECAST,
    SERIES,
    WEATHER_RUN_DELAY_HOURS,
    Series,
)
from epf.timeutil import delivery_bounds_utc, delivery_date, local_time_on

Severity = Literal["error", "warning", "info"]
PRICE_CONSISTENCY_TOLERANCE = 0.02  # EUR/MWh; SMARD rounds both resolutions to 2 decimals
FROZEN_HOURS = 6  # identical demand values for this long point to a stuck feed
MAX_LISTED = 5


@dataclass(frozen=True)
class Issue:
    check: str
    subject: str
    severity: Severity
    count: int
    message: str


def _severity(series: Series) -> Severity:
    return "error" if series.critical else "warning"


def missing_intervals(valid: pd.Series, interval_minutes: int) -> pd.DatetimeIndex:
    """Timestamps absent between a series' first and last value. On a UTC grid, 23- and 25-hour
    days need no special handling, and a daylight saving day cannot look like a gap."""
    if valid.empty:
        return pd.DatetimeIndex([])
    grid = pd.date_range(valid.min(), valid.max(), freq=f"{interval_minutes}min")
    return grid.difference(pd.DatetimeIndex(valid))


def check_missing(df: pd.DataFrame, series: Series) -> list[Issue]:
    interval = 60 if series.resolution == "hour" else 15
    gaps = missing_intervals(df["valid_from_utc"], interval)
    if gaps.empty:
        return []
    listed = ", ".join(t.strftime("%Y-%m-%d %H:%M") for t in gaps[:MAX_LISTED])
    return [
        Issue(
            "missing_intervals",
            series.series_id,
            _severity(series),
            len(gaps),
            f"{len(gaps)} missing intervals, first: {listed}",
        )
    ]


def check_duplicates(df: pd.DataFrame, series: Series) -> list[Issue]:
    count = int(df["valid_from_utc"].duplicated().sum())
    if not count:
        return []
    return [Issue("duplicates", series.series_id, "error", count, f"{count} duplicate timestamps")]


def check_range(df: pd.DataFrame, series: Series) -> list[Issue]:
    bad = df[(df["value"] < series.min_value) | (df["value"] > series.max_value)]
    if bad.empty:
        return []
    first = bad.iloc[0]
    return [
        Issue(
            "unexpected_values",
            series.series_id,
            _severity(series),
            len(bad),
            f"{len(bad)} values outside [{series.min_value}, {series.max_value}] {series.unit}; "
            f"first at {first['valid_from_utc']}",
        )
    ]


def check_frozen(df: pd.DataFrame, series: Series) -> list[Issue]:
    if series.series_id not in {"load_forecast", "load_actual"} or df.empty:
        return []
    runs = (df["value"] != df["value"].shift()).cumsum()
    longest = int(df.groupby(runs)["value"].size().max())
    if longest < FROZEN_HOURS:
        return []
    return [
        Issue(
            "unexpected_values",
            series.series_id,
            _severity(series),
            longest,
            f"same value repeated for {longest} consecutive hours",
        )
    ]


def expected_last_delivery(series: Series, now: datetime) -> date | None:
    """The newest delivery date that should have data by `now`. None for actuals."""
    today = delivery_date(now)
    rule = {
        "da_price": RULE_DA_PRICE,
        "load_forecast": RULE_LOAD_FORECAST,
        "res_forecast": RULE_RES_FORECAST,
    }.get(series.kind)
    if rule is None:
        return None
    return today + timedelta(days=1) if now >= local_time_on(today, *rule) else today


def check_stale(df: pd.DataFrame, series: Series, now: datetime) -> list[Issue]:
    if df.empty:
        return [Issue("stale", series.series_id, _severity(series), 1, "series has no data")]
    last = df["valid_from_utc"].max().to_pydatetime()
    interval = timedelta(minutes=60 if series.resolution == "hour" else 15)
    expected = expected_last_delivery(series, now)
    if expected is not None:
        _, end = delivery_bounds_utc(expected)
        if last + interval < end:
            return [
                Issue(
                    "stale",
                    series.series_id,
                    _severity(series),
                    1,
                    f"data ends at {last}, expected through delivery date {expected}",
                )
            ]
        return []
    allowed = timedelta(hours=ACTUAL_DELAY_HOURS * 4)
    if now - last > allowed:
        return [
            Issue(
                "stale",
                series.series_id,
                _severity(series),
                1,
                f"latest actual is {last}, older than {allowed} at {now:%Y-%m-%d %H:%M}",
            )
        ]
    return []


def check_price_consistency(h: pd.DataFrame, q: pd.DataFrame) -> list[Issue]:
    """Since the 15-minute switch, the hourly price should equal the mean of its four quarters."""
    if h.empty or q.empty:
        return []
    q = q.assign(hour=q["valid_from_utc"].dt.floor("h"))
    grouped = q.groupby("hour")["value"].agg(["mean", "size"])
    joined = h.set_index("valid_from_utc")["value"].to_frame().join(grouped, how="inner")
    joined = joined[joined["size"] == 4]
    joined = joined[joined.index >= pd.Timestamp(PRICE_15MIN_START_UTC)]
    bad = joined[(joined["value"] - joined["mean"]).abs() > PRICE_CONSISTENCY_TOLERANCE]
    if bad.empty:
        return []
    return [
        Issue(
            "price_consistency",
            "price_da_60",
            "error",
            len(bad),
            f"{len(bad)} hourly prices differ from the 15-minute mean, first at {bad.index[0]}",
        )
    ]


def check_weather(con: duckdb.DuckDBPyConnection, now: datetime) -> list[Issue]:
    row = con.execute("SELECT max(run_utc) FROM weather_run").fetchone()
    latest = row[0] if row else None
    if latest is None:
        return [Issue("stale", "weather", "error", 1, "no weather runs loaded")]
    issues: list[Issue] = []
    # Today's 00 UTC run is due by the rule; yesterday's fallback runs cover it until then.
    day_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    due = (
        day_start
        if now >= day_start + timedelta(hours=WEATHER_RUN_DELAY_HOURS)
        else (day_start - timedelta(hours=6))
    )
    if latest < due:
        issues.append(
            Issue(
                "stale", "weather", "error", 1, f"latest run is {latest}, expected {due} or later"
            )
        )
    days = con.execute(
        """WITH d AS (
             SELECT unnest(generate_series(
               (SELECT min(run_utc) FROM weather_run), ?, INTERVAL 1 DAY)) AS day
           )
           SELECT day FROM d WHERE day NOT IN (SELECT DISTINCT run_utc FROM weather_run)
             AND day - INTERVAL 6 HOUR NOT IN (SELECT DISTINCT run_utc FROM weather_run)""",
        [day_start - timedelta(days=1)],
    ).fetchall()
    if days:
        listed = ", ".join(str(d[0].date()) for d in days[:MAX_LISTED])
        issues.append(
            Issue(
                "missing_intervals",
                "weather",
                "warning",
                len(days),
                f"{len(days)} days lack a usable run, first: {listed}",
            )
        )
    return issues


def run_checks(con: duckdb.DuckDBPyConnection, now: datetime) -> list[Issue]:
    issues: list[Issue] = []
    frames: dict[str, pd.DataFrame] = {}
    for series in SERIES:
        df = con.execute(
            """SELECT valid_from_utc, value, revision_count FROM clean_series
               WHERE series_id = ? ORDER BY valid_from_utc""",
            [series.series_id],
        ).fetchdf()
        frames[series.series_id] = df
        issues += check_stale(df, series, now)
        if df.empty:
            continue
        issues += check_missing(df, series)
        issues += check_duplicates(df, series)
        issues += check_range(df, series)
        issues += check_frozen(df, series)
        revised = int((df["revision_count"] > 0).sum())
        if revised:
            issues.append(
                Issue("revisions", series.series_id, "info", revised, f"{revised} values revised")
            )
    conflicts = con.execute(
        "SELECT series_id, count(*) FROM clean_conflict GROUP BY 1 ORDER BY 1"
    ).fetchall()
    issues += [
        Issue("duplicates", s, "error", int(n), f"{n} timestamps with conflicting values")
        for s, n in conflicts
    ]
    issues += check_price_consistency(frames["price_da_60"], frames["price_da_15"])
    issues += check_weather(con, now)
    price = frames["price_da_60"]
    if not price.empty:
        negative = int((price["value"] < 0).sum())
        issues.append(
            Issue(
                "negative_prices",
                "price_da_60",
                "info",
                negative,
                f"{negative} negative hourly prices kept ({negative / len(price):.1%})",
            )
        )
    return issues


def write_report(issues: list[Issue], now: datetime, out_dir: Path) -> Path:
    out_dir.mkdir(parents=True, exist_ok=True)
    path = out_dir / "latest.json"
    payload = {
        "checked_at_utc": now.isoformat(timespec="seconds"),
        "errors": sum(i.severity == "error" for i in issues),
        "warnings": sum(i.severity == "warning" for i in issues),
        "issues": [asdict(i) for i in issues],
    }
    path.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    return path
