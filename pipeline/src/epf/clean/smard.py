"""Turn stored SMARD vintages into `clean_series`, with a rule-based availability time per row."""

from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import datetime

import duckdb
import pandas as pd

from epf.config import (
    ACTUAL_DELAY_HOURS,
    PRICE_15MIN_START_UTC,
    RULE_DA_PRICE,
    RULE_LOAD_FORECAST,
    RULE_RES_FORECAST,
    Series,
)
from epf.ingest import energycharts
from epf.ingest.raw import decode
from epf.ingest.smard import parse_chunk
from epf.timeutil import rule_day_before

log = logging.getLogger(__name__)


@dataclass
class _Point:
    value: float
    raw_id: int
    first_seen: datetime
    revisions: int


def available_at(series: Series, valid_from: pd.Series, interval_minutes: int) -> pd.Series:
    """Earliest time a value may be used, in naive UTC. This is what leakage tests enforce."""
    if series.kind == "da_price":
        return rule_day_before(valid_from, *RULE_DA_PRICE)
    if series.kind == "load_forecast":
        return rule_day_before(valid_from, *RULE_LOAD_FORECAST)
    if series.kind == "res_forecast":
        return rule_day_before(valid_from, *RULE_RES_FORECAST)
    return (
        valid_from + pd.Timedelta(minutes=interval_minutes) + pd.Timedelta(hours=ACTUAL_DELAY_HOURS)
    )


def to_clean_value(series: Series, value: float, interval_minutes: int) -> float:
    """SMARD reports energy as MWh per interval; cleaned power is average MW over the interval."""
    return value * 60 / interval_minutes if series.unit == "MW" else value


def _collect(
    con: duckdb.DuckDBPyConnection, series: Series
) -> tuple[dict[datetime, _Point], list[tuple[datetime, float, float]]]:
    rows = con.execute(
        """SELECT id, request_key, fetched_at_utc, body_gz FROM raw_response
           WHERE request_key LIKE ? ORDER BY fetched_at_utc, id""",
        [f"smard:{series.filter_id}:{series.resolution}:%"],
    ).fetchall()
    per_key: dict[str, dict[datetime, _Point]] = {}
    for raw_id, key, fetched_at, body in rows:
        points = per_key.setdefault(key, {})
        for valid, value in parse_chunk(decode(body)):
            if value is None:
                continue
            existing = points.get(valid)
            if existing is None:
                points[valid] = _Point(value, raw_id, fetched_at, 0)
            elif existing.value != value:
                existing.value = value
                existing.raw_id = raw_id
                existing.revisions += 1
    merged: dict[datetime, _Point] = {}
    conflicts: list[tuple[datetime, float, float]] = []
    for key in sorted(per_key):
        for valid, point in per_key[key].items():
            other = merged.get(valid)
            if other is not None and other.value != point.value:
                conflicts.append((valid, other.value, point.value))
            merged[valid] = point
    return merged, conflicts


def _fallback_prices(con: duckdb.DuckDBPyConnection, series: Series) -> dict[datetime, _Point]:
    """Energy-Charts prices at this series' resolution; the latest vintage of each value wins.

    Hourly values are the mean of the hour's four quarters, rounded to cents as SMARD does,
    and only for hours with all four quarters present.
    """
    rows = con.execute(
        """SELECT id, fetched_at_utc, body_gz FROM raw_response
           WHERE request_key LIKE ? ORDER BY fetched_at_utc, id""",
        [f"{energycharts.KEY_PREFIX}%"],
    ).fetchall()
    quarters: dict[datetime, _Point] = {}
    for raw_id, fetched_at, body in rows:
        for valid, value in energycharts.parse(decode(body)):
            if value is None:
                continue
            existing = quarters.get(valid)
            if existing is None:
                quarters[valid] = _Point(value, raw_id, fetched_at, 0)
            elif existing.value != value:
                existing.value, existing.raw_id = value, raw_id
                existing.revisions += 1
    if series.resolution != "hour":
        return quarters
    hours: dict[datetime, list[_Point]] = {}
    for valid, point in quarters.items():
        hours.setdefault(valid.replace(minute=0), []).append(point)
    return {
        hour: _Point(
            round(sum(p.value for p in pts) / 4, 2),
            max(p.raw_id for p in pts),
            max(p.first_seen for p in pts),
            max(p.revisions for p in pts),
        )
        for hour, pts in hours.items()
        if len(pts) == 4
    }


def build_series(con: duckdb.DuckDBPyConnection, series: Series) -> int:
    merged, conflicts = _collect(con, series)
    filled = 0
    if series.kind == "da_price":
        start_15 = datetime.fromisoformat(PRICE_15MIN_START_UTC)
        for valid, point in _fallback_prices(con, series).items():
            if valid >= start_15 and valid not in merged:
                merged[valid] = point
                filled += 1
        if filled:
            log.info("%s: %d values filled from Energy-Charts", series.series_id, filled)
    interval = 60 if series.resolution == "hour" else 15
    df = pd.DataFrame(
        [
            {
                "valid_from_utc": valid,
                "value": to_clean_value(series, p.value, interval),
                "first_seen_utc": p.first_seen,
                "revision_count": p.revisions,
                "raw_id": p.raw_id,
            }
            for valid, p in sorted(merged.items())
        ]
    )
    con.execute("BEGIN")
    con.execute("DELETE FROM clean_series WHERE series_id = ?", [series.series_id])
    con.execute("DELETE FROM clean_conflict WHERE series_id = ?", [series.series_id])
    if conflicts:
        con.executemany(
            "INSERT INTO clean_conflict VALUES (?, ?, ?, ?)",
            [(series.series_id, *c) for c in conflicts],
        )
    if not df.empty and series.series_id == "price_da_15":
        # Before the switch to 15-minute MTUs this series only repeats the hourly price.
        df = df[df["valid_from_utc"] >= pd.Timestamp(PRICE_15MIN_START_UTC)]
    if not df.empty:
        df["valid_from_utc"] = pd.to_datetime(df["valid_from_utc"])
        df["available_at_utc"] = available_at(series, df["valid_from_utc"], interval)
        con.register("df_clean", df)
        con.execute(
            """INSERT INTO clean_series
               SELECT ?, valid_from_utc, ?, value, ?, available_at_utc, 'rule',
                      first_seen_utc, revision_count, raw_id FROM df_clean""",
            [series.series_id, interval, series.unit],
        )
        con.unregister("df_clean")
    con.execute("COMMIT")
    log.info("%s: %d rows, %d conflicts", series.series_id, len(df), len(conflicts))
    return len(df)
