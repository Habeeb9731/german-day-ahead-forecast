"""DuckDB schema. Timestamps are stored as naive UTC in `_utc` columns."""

from __future__ import annotations

from pathlib import Path

import duckdb

from epf.config import db_path

SCHEMA = """
CREATE SEQUENCE IF NOT EXISTS raw_response_id;

-- Unchanged response bodies (gzip is lossless). A new row is added only when the body changes,
-- so each row is a vintage and repeated fetches are idempotent.
CREATE TABLE IF NOT EXISTS raw_response (
    id BIGINT PRIMARY KEY DEFAULT nextval('raw_response_id'),
    source TEXT NOT NULL,
    request_key TEXT NOT NULL,
    url TEXT NOT NULL,
    fetched_at_utc TIMESTAMP NOT NULL,
    http_status INTEGER NOT NULL,
    last_modified TEXT,
    etag TEXT,
    sha256 TEXT NOT NULL,
    body_gz BLOB NOT NULL,
    UNIQUE (request_key, sha256)
);

-- Every attempt, including unchanged bodies and known-unavailable requests.
CREATE TABLE IF NOT EXISTS fetch_log (
    request_key TEXT NOT NULL,
    fetched_at_utc TIMESTAMP NOT NULL,
    http_status INTEGER NOT NULL,
    sha256 TEXT,
    changed BOOLEAN NOT NULL,
    note TEXT
);

CREATE TABLE IF NOT EXISTS clean_series (
    series_id TEXT NOT NULL,
    valid_from_utc TIMESTAMP NOT NULL,
    interval_minutes INTEGER NOT NULL,
    value DOUBLE NOT NULL,
    unit TEXT NOT NULL,
    available_at_utc TIMESTAMP NOT NULL,
    availability_basis TEXT NOT NULL,
    first_seen_utc TIMESTAMP NOT NULL,
    revision_count INTEGER NOT NULL,
    raw_id BIGINT NOT NULL,
    PRIMARY KEY (series_id, valid_from_utc)
);

-- Different values for the same timestamp inside one snapshot of chunks. Fails quality checks.
CREATE TABLE IF NOT EXISTS clean_conflict (
    series_id TEXT NOT NULL,
    valid_from_utc TIMESTAMP NOT NULL,
    value_a DOUBLE,
    value_b DOUBLE
);

CREATE TABLE IF NOT EXISTS weather_run (
    run_utc TIMESTAMP NOT NULL,
    valid_utc TIMESTAMP NOT NULL,
    location TEXT NOT NULL,
    variable TEXT NOT NULL,
    value DOUBLE,
    available_at_utc TIMESTAMP NOT NULL,
    raw_id BIGINT NOT NULL,
    PRIMARY KEY (run_utc, valid_utc, location, variable)
);

CREATE TABLE IF NOT EXISTS holiday (
    holiday_date DATE PRIMARY KEY,
    name TEXT NOT NULL,
    is_national BOOLEAN NOT NULL,
    state_share DOUBLE NOT NULL
);
"""


def connect(path: Path | None = None) -> duckdb.DuckDBPyConnection:
    target = path or db_path()
    if str(target) != ":memory:":
        target.parent.mkdir(parents=True, exist_ok=True)
    con = duckdb.connect(str(target))
    con.execute("SET TimeZone='UTC'")
    con.execute(SCHEMA)
    return con
