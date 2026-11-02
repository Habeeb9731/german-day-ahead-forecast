"""Open-Meteo Single Runs ingestion: one fixed model run per request, so issue time is exact."""

from __future__ import annotations

import json
import logging
import time
from collections.abc import Callable, Sequence
from datetime import datetime, timedelta

import duckdb
import httpx

from epf.config import (
    OPEN_METEO_SINGLE_RUNS,
    WEATHER_FORECAST_HOURS,
    WEATHER_LOCATIONS,
    WEATHER_MODEL,
    WEATHER_UNITS,
    WEATHER_VARIABLES,
    Location,
)
from epf.ingest.http import FetchError, fetch
from epf.ingest.raw import log_unavailable, store

log = logging.getLogger(__name__)

SOURCE = "open-meteo"
# Free tier: 5,000 calls/hour and 10,000/day, with each location counting as a call. At 6 locations
# this spacing stays near 4,300/hour; a full archive backfill takes about 80 minutes.
BACKFILL_SPACING_SECONDS = 5.0


class WeatherParseError(ValueError):
    """An Open-Meteo response did not match the requested shape or units."""


def run_key(run: datetime) -> str:
    return f"open-meteo:{WEATHER_MODEL}:{run:%Y-%m-%dT%H}"


def request_params(run: datetime, locations: Sequence[Location]) -> dict[str, str | int]:
    return {
        "latitude": ",".join(str(x.latitude) for x in locations),
        "longitude": ",".join(str(x.longitude) for x in locations),
        "hourly": ",".join(WEATHER_VARIABLES),
        "models": WEATHER_MODEL,
        "run": f"{run:%Y-%m-%dT%H:%M}",
        "forecast_hours": WEATHER_FORECAST_HOURS,
        "timezone": "UTC",
    }


def parse_run(
    body: bytes, locations: Sequence[Location] = WEATHER_LOCATIONS
) -> list[tuple[datetime, str, str, float | None]]:
    """Parse into (valid_utc, location, variable, value), validating timezone, units and grid."""
    payload = json.loads(body)
    blocks = payload if isinstance(payload, list) else [payload]
    if len(blocks) != len(locations):
        raise WeatherParseError(f"expected {len(locations)} locations, got {len(blocks)}")
    rows: list[tuple[datetime, str, str, float | None]] = []
    for loc, block in zip(locations, blocks, strict=True):
        if block.get("utc_offset_seconds") != 0:
            raise WeatherParseError("response is not in UTC")
        if (
            abs(block["latitude"] - loc.latitude) > 0.5
            or abs(block["longitude"] - loc.longitude) > 0.5
        ):
            raise WeatherParseError(f"grid point too far from {loc.name}")
        hourly = block["hourly"]
        units = block["hourly_units"]
        times = [datetime.fromisoformat(t) for t in hourly["time"]]
        for var in WEATHER_VARIABLES:
            if units.get(var) != WEATHER_UNITS[var]:
                raise WeatherParseError(f"unexpected unit for {var}: {units.get(var)}")
            values = hourly[var]
            if len(values) != len(times):
                raise WeatherParseError(f"length mismatch for {var}")
            rows.extend((t, loc.name, var, v) for t, v in zip(times, values, strict=True))
    return rows


def ingest_run(con: duckdb.DuckDBPyConnection, client: httpx.Client, run: datetime) -> bool:
    """Fetch one run. Returns False if Open-Meteo reports the run as unavailable (HTTP 400)."""
    response = fetch(
        client,
        OPEN_METEO_SINGLE_RUNS,
        params=request_params(run, WEATHER_LOCATIONS),
        accept_status=frozenset({200, 400}),
    )
    key = run_key(run)
    if response.status == 400:
        reason = response.body.decode(errors="replace")
        if "not available" not in reason:
            raise FetchError(f"Open-Meteo rejected {key}: {reason[:200]}")
        log_unavailable(con, key, 400, reason)
        log.warning("run unavailable: %s", key)
        return False
    parse_run(response.body)
    store(con, SOURCE, key, response)
    return True


def stored_runs(con: duckdb.DuckDBPyConnection) -> set[str]:
    rows = con.execute(
        "SELECT DISTINCT request_key FROM raw_response WHERE source = ?", [SOURCE]
    ).fetchall()
    return {r[0] for r in rows}


def backfill(
    con: duckdb.DuckDBPyConnection,
    client: httpx.Client,
    start: datetime,
    end: datetime,
    spacing: float = BACKFILL_SPACING_SECONDS,
    sleep: Callable[[float], None] = time.sleep,
) -> dict[str, int]:
    """Fetch the 00 UTC run per day in [start, end]. A missing day falls back to the 18 UTC run of
    the previous evening, which was also issued before that day's cutoff. Resumable."""
    have = stored_runs(con)
    fetched = skipped = unavailable = 0
    day = start
    while day <= end:
        if run_key(day) in have:
            skipped += 1
        else:
            ok = ingest_run(con, client, day)
            fetched += 1
            sleep(spacing)
            if not ok:
                unavailable += 1
                fallback = day - timedelta(hours=6)
                if run_key(fallback) not in have:
                    ingest_run(con, client, fallback)
                    fetched += 1
                    sleep(spacing)
            if fetched % 50 == 0:
                log.info("weather backfill at %s: %d fetched", day.date(), fetched)
        day += timedelta(days=1)
    return {"fetched": fetched, "skipped": skipped, "unavailable": unavailable}
