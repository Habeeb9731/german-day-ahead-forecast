"""SMARD chart_data ingestion. The API serves weekly chunks listed by an index file."""

from __future__ import annotations

import json
import logging
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta

import duckdb
import httpx

from epf.config import SMARD_BASE, Series
from epf.ingest.http import Response, fetch
from epf.ingest.raw import store
from epf.timeutil import ms_to_utc, utcnow

log = logging.getLogger(__name__)

SOURCE = "smard"
# Recent chunks are re-fetched because current weeks fill up and values can be revised.
REFRESH_WEEKS = 3


class SmardParseError(ValueError):
    """A SMARD response did not have the expected shape."""


def index_url(series: Series) -> str:
    return f"{SMARD_BASE}/{series.filter_id}/DE/index_{series.resolution}.json"


def chunk_url(series: Series, chunk_ms: int) -> str:
    f = series.filter_id
    return f"{SMARD_BASE}/{f}/DE/{f}_DE_{series.resolution}_{chunk_ms}.json"


def chunk_key(series: Series, chunk_ms: int) -> str:
    return f"smard:{series.filter_id}:{series.resolution}:{chunk_ms}"


def parse_index(body: bytes) -> list[int]:
    try:
        stamps = json.loads(body)["timestamps"]
    except (KeyError, TypeError, json.JSONDecodeError) as exc:
        raise SmardParseError(f"bad index payload: {exc}") from exc
    if not stamps or not all(isinstance(t, int) for t in stamps):
        raise SmardParseError("index has no integer timestamps")
    return sorted(stamps)


def parse_chunk(body: bytes) -> list[tuple[datetime, float | None]]:
    """Parse a chunk into (valid_from_utc, value). Null means not published yet."""
    try:
        rows = json.loads(body)["series"]
    except (KeyError, TypeError, json.JSONDecodeError) as exc:
        raise SmardParseError(f"bad chunk payload: {exc}") from exc
    out: list[tuple[datetime, float | None]] = []
    for row in rows:
        if not (isinstance(row, list) and len(row) == 2 and isinstance(row[0], int)):
            raise SmardParseError(f"bad chunk row: {row!r}")
        value = row[1]
        if value is not None and not isinstance(value, int | float):
            raise SmardParseError(f"non-numeric value: {row!r}")
        out.append((ms_to_utc(row[0]), None if value is None else float(value)))
    return out


def select_chunks(
    all_chunks: list[int],
    since: datetime,
    known_keys: set[str],
    series: Series,
    now: datetime,
) -> list[int]:
    """Chunks to fetch: anything missing, plus the most recent weeks."""
    refresh_after = now - timedelta(weeks=REFRESH_WEEKS)
    earliest = since - timedelta(days=7)  # a chunk starting before `since` may still cover it
    selected = []
    for ms in all_chunks:
        start = ms_to_utc(ms)
        if start < earliest:
            continue
        if start >= refresh_after or chunk_key(series, ms) not in known_keys:
            selected.append(ms)
    return selected


def ingest_series(
    con: duckdb.DuckDBPyConnection,
    client: httpx.Client,
    series: Series,
    since: datetime,
    workers: int = 4,
    now: datetime | None = None,
) -> dict[str, int]:
    """Fetch new and recent chunks. Network calls run in threads; DuckDB writes stay on this one."""
    now = now or utcnow()
    all_chunks = parse_index(fetch(client, index_url(series)).body)
    known = {
        r[0]
        for r in con.execute(
            "SELECT DISTINCT request_key FROM raw_response WHERE request_key LIKE ?",
            [f"smard:{series.filter_id}:{series.resolution}:%"],
        ).fetchall()
    }
    selected = select_chunks(all_chunks, since, known, series, now)

    def get(ms: int) -> tuple[int, Response]:
        return ms, fetch(client, chunk_url(series, ms))

    changed = 0
    with ThreadPoolExecutor(max_workers=workers) as pool:
        for ms, response in pool.map(get, selected):
            parse_chunk(response.body)  # reject malformed payloads before storing as valid
            changed += store(con, SOURCE, chunk_key(series, ms), response).changed
    log.info("%s: fetched %d chunks, %d new vintages", series.series_id, len(selected), changed)
    return {"fetched": len(selected), "changed": changed}
