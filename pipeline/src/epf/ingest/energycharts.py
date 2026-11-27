"""Energy-Charts (Fraunhofer ISE) day-ahead prices, used only where SMARD leaves a day empty.

SMARD occasionally publishes a delivery day with every price null and never fills it (21 Nov
2026 is one). Energy-Charts redistributes the same Bundesnetzagentur | SMARD.de prices under
CC BY 4.0, at 15-minute resolution, and matched SMARD exactly on every day checked. Responses
are stored raw like SMARD's, and cleaning uses them only for timestamps SMARD has no value for.
"""

from __future__ import annotations

import json
import logging
from datetime import date, datetime, timedelta

import duckdb
import httpx

from epf.config import PRICE_15MIN_START_UTC
from epf.ingest.http import fetch
from epf.ingest.raw import store
from epf.timeutil import delivery_bounds_utc, delivery_date, delivery_hours, ms_to_utc

log = logging.getLogger(__name__)

SOURCE = "energy_charts"
BASE = "https://api.energy-charts.info"
BIDDING_ZONE = "DE-LU"
KEY_PREFIX = f"energycharts:price:{BIDDING_ZONE}:"
# Gaps older than this are left alone; the forecast only needs recent weeks to be complete.
LOOKBACK_DAYS = 21


class EnergyChartsParseError(ValueError):
    """An Energy-Charts response did not have the expected shape."""


def request_key(day: date) -> str:
    return f"{KEY_PREFIX}{day.isoformat()}"


def day_url(day: date) -> str:
    """Prices for one Berlin delivery day. The API's end bound is inclusive."""
    start, end = delivery_bounds_utc(day)
    last = end - timedelta(minutes=15)
    fmt = "%Y-%m-%dT%H:%MZ"
    return f"{BASE}/price?bzn={BIDDING_ZONE}&start={start.strftime(fmt)}&end={last.strftime(fmt)}"


def parse(body: bytes) -> list[tuple[datetime, float | None]]:
    """Parse a response into (valid_from_utc, EUR/MWh). Null means no price for that interval."""
    try:
        payload = json.loads(body)
        stamps, prices = payload["unix_seconds"], payload["price"]
    except (KeyError, TypeError, json.JSONDecodeError) as exc:
        raise EnergyChartsParseError(f"bad payload: {exc}") from exc
    if not isinstance(stamps, list) or not isinstance(prices, list) or len(stamps) != len(prices):
        raise EnergyChartsParseError("unix_seconds and price differ in length")
    out: list[tuple[datetime, float | None]] = []
    for stamp, price in zip(stamps, prices, strict=True):
        if not isinstance(stamp, int):
            raise EnergyChartsParseError(f"bad timestamp: {stamp!r}")
        if price is not None and not isinstance(price, int | float):
            raise EnergyChartsParseError(f"non-numeric price: {price!r}")
        out.append((ms_to_utc(stamp * 1000), None if price is None else float(price)))
    return out


def gap_days(con: duckdb.DuckDBPyConnection, now: datetime) -> list[date]:
    """Recent delivery days whose 15-minute prices are incomplete in `clean_series`."""
    today = delivery_date(now)
    first = max(
        today - timedelta(days=LOOKBACK_DAYS),
        delivery_date(datetime.fromisoformat(PRICE_15MIN_START_UTC)),
    )
    start, _ = delivery_bounds_utc(first)
    _, end = delivery_bounds_utc(today)
    rows = con.execute(
        """SELECT valid_from_utc FROM clean_series
           WHERE series_id = 'price_da_15' AND valid_from_utc >= ? AND valid_from_utc < ?""",
        [start, end],
    ).fetchall()
    counts: dict[date, int] = {}
    for (valid,) in rows:
        day = delivery_date(valid)
        counts[day] = counts.get(day, 0) + 1
    days = []
    day = first
    while day <= today:
        if counts.get(day, 0) < delivery_hours(day) * 4:
            days.append(day)
        day += timedelta(days=1)
    return days


def fill_gaps(con: duckdb.DuckDBPyConnection, client: httpx.Client, now: datetime) -> int:
    """Fetch Energy-Charts prices for incomplete recent days. Returns the number of new vintages."""
    changed = 0
    days = gap_days(con, now)
    for day in days:
        response = fetch(client, day_url(day))
        points = parse(response.body)  # reject malformed payloads before storing as valid
        usable = sum(value is not None for _, value in points)
        changed += store(con, SOURCE, request_key(day), response).changed
        log.info("energy-charts: %s has %d usable prices", day, usable)
    if days:
        log.info("energy-charts: checked %d incomplete days, %d new vintages", len(days), changed)
    return changed
