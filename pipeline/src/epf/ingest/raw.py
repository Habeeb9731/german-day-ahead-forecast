"""Idempotent raw response storage. Bodies are kept byte-for-byte (gzip-compressed)."""

from __future__ import annotations

import gzip
import hashlib
from dataclasses import dataclass
from datetime import datetime

import duckdb

from epf.ingest.http import Response
from epf.timeutil import utcnow


@dataclass(frozen=True)
class StoreResult:
    raw_id: int
    changed: bool


def store(
    con: duckdb.DuckDBPyConnection,
    source: str,
    request_key: str,
    response: Response,
    fetched_at: datetime | None = None,
) -> StoreResult:
    """Record a fetch. A row is added to raw_response only if this body is new for the key."""
    now = fetched_at or utcnow()
    sha = hashlib.sha256(response.body).hexdigest()
    existing = con.execute(
        "SELECT id FROM raw_response WHERE request_key = ? AND sha256 = ?", [request_key, sha]
    ).fetchone()
    changed = existing is None
    if existing is None:
        row = con.execute(
            """INSERT INTO raw_response
               (source, request_key, url, fetched_at_utc, http_status, last_modified, etag,
                sha256, body_gz)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id""",
            [
                source,
                request_key,
                response.url,
                now,
                response.status,
                response.last_modified,
                response.etag,
                sha,
                gzip.compress(response.body, mtime=0),
            ],
        ).fetchone()
        assert row is not None
        raw_id = int(row[0])
    else:
        raw_id = int(existing[0])
    con.execute(
        "INSERT INTO fetch_log VALUES (?, ?, ?, ?, ?, NULL)",
        [request_key, now, response.status, sha, changed],
    )
    return StoreResult(raw_id=raw_id, changed=changed)


def log_unavailable(
    con: duckdb.DuckDBPyConnection, request_key: str, status: int, note: str
) -> None:
    con.execute(
        "INSERT INTO fetch_log VALUES (?, ?, ?, NULL, FALSE, ?)",
        [request_key, utcnow(), status, note[:300]],
    )


def decode(body_gz: bytes) -> bytes:
    return gzip.decompress(body_gz)
