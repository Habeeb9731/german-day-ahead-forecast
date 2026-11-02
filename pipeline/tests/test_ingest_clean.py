"""Ingestion and cleaning against mocked responses. All values are SYNTHETIC SAMPLE DATA."""

from datetime import datetime, timedelta

import httpx
from conftest import chunk_body

from epf.clean.smard import build_series
from epf.config import SERIES_BY_ID
from epf.ingest import smard
from epf.ingest.http import Response, make_client
from epf.ingest.raw import store
from epf.timeutil import utc_to_ms

PRICE = SERIES_BY_ID["price_da_60"]
LOAD = SERIES_BY_ID["load_forecast"]
T0 = datetime(2026, 6, 1, 0)


def _response(body: bytes) -> Response:
    return Response("https://example.test", 200, body, None, None)


def _store(con, series, chunk: datetime, points, fetched_at):
    key = smard.chunk_key(series, utc_to_ms(chunk))
    return store(con, "smard", key, _response(chunk_body(points)), fetched_at=fetched_at)


def test_same_body_twice_keeps_one_vintage(con):
    pts = [(T0, 50.0)]
    a = _store(con, PRICE, T0, pts, datetime(2026, 6, 2))
    b = _store(con, PRICE, T0, pts, datetime(2026, 6, 3))
    assert a.changed and not b.changed and a.raw_id == b.raw_id
    assert con.execute("SELECT count(*) FROM raw_response").fetchone()[0] == 1
    assert con.execute("SELECT count(*) FROM fetch_log").fetchone()[0] == 2


def test_raw_body_is_unchanged(con):
    from epf.ingest.raw import decode

    body = chunk_body([(T0, 50.0)])
    store(con, "smard", "k", _response(body))
    stored = con.execute("SELECT body_gz FROM raw_response").fetchone()[0]
    assert decode(stored) == body


def test_revision_is_tracked_and_latest_value_wins(con):
    _store(con, PRICE, T0, [(T0, 50.0), (T0 + timedelta(hours=1), None)], datetime(2026, 6, 2))
    _store(con, PRICE, T0, [(T0, 55.0), (T0 + timedelta(hours=1), 60.0)], datetime(2026, 6, 3))
    build_series(con, PRICE)
    rows = con.execute(
        "SELECT value, revision_count, first_seen_utc FROM clean_series ORDER BY valid_from_utc"
    ).fetchall()
    assert rows[0] == (55.0, 1, datetime(2026, 6, 2))
    assert rows[1] == (60.0, 0, datetime(2026, 6, 3))


def test_negative_prices_are_kept_and_nulls_dropped(con):
    _store(con, PRICE, T0, [(T0, -250.0), (T0 + timedelta(hours=1), None)], datetime(2026, 6, 2))
    build_series(con, PRICE)
    assert con.execute("SELECT value FROM clean_series").fetchall() == [(-250.0,)]


def test_conflicting_chunks_are_recorded(con):
    _store(con, PRICE, T0, [(T0, 50.0)], datetime(2026, 6, 2))
    _store(con, PRICE, T0 + timedelta(days=7), [(T0, 70.0)], datetime(2026, 6, 2))
    build_series(con, PRICE)
    assert con.execute("SELECT count(*) FROM clean_conflict").fetchone()[0] == 1


def test_rebuild_is_idempotent(con):
    _store(con, PRICE, T0, [(T0, 50.0)], datetime(2026, 6, 2))
    build_series(con, PRICE)
    first = con.execute("SELECT * FROM clean_series").fetchall()
    build_series(con, PRICE)
    assert con.execute("SELECT * FROM clean_series").fetchall() == first


def test_quarter_hour_energy_becomes_average_power():
    from epf.clean.smard import to_clean_value
    from epf.config import Series

    quarter = Series("x", 1, "quarterhour", "actual", "MW", False, 0, 1)
    assert to_clean_value(quarter, 12_500.0, 15) == 50_000.0
    assert to_clean_value(LOAD, 50_000.0, 60) == 50_000.0
    assert to_clean_value(PRICE, 80.0, 60) == 80.0


def test_quarter_hour_price_starts_at_mtu_switch(con):
    q = SERIES_BY_ID["price_da_15"]
    before = datetime(2025, 9, 30, 21, 45)
    after = datetime(2025, 9, 30, 22, 0)
    _store(con, q, before, [(before, 90.0), (after, 95.0)], datetime(2026, 1, 1))
    build_series(con, q)
    rows = con.execute("SELECT valid_from_utc, interval_minutes FROM clean_series").fetchall()
    assert rows == [(after, 15)]


def test_availability_rules_on_clean_rows(con):
    valid = datetime(2026, 6, 15, 10)  # delivery 2026-06-15, CEST
    _store(con, PRICE, valid, [(valid, 80.0)], datetime(2026, 6, 16))
    build_series(con, PRICE)
    got = con.execute("SELECT available_at_utc, availability_basis FROM clean_series").fetchone()
    assert got == (datetime(2026, 6, 14, 18, 0), "rule")  # 20:00 Berlin the day before


def test_select_chunks_refreshes_recent_and_skips_known_old():
    now = datetime(2026, 6, 30)
    old = utc_to_ms(datetime(2026, 1, 5))
    missing = utc_to_ms(datetime(2026, 2, 2))
    recent = utc_to_ms(datetime(2026, 6, 22))
    too_old = utc_to_ms(datetime(2022, 1, 3))
    known = {smard.chunk_key(PRICE, old), smard.chunk_key(PRICE, recent)}
    got = smard.select_chunks(
        [too_old, old, missing, recent], datetime(2023, 1, 1), known, PRICE, now
    )
    assert got == [missing, recent]


def test_ingest_series_end_to_end_is_idempotent(con):
    chunk = utc_to_ms(T0)

    def handler(request: httpx.Request) -> httpx.Response:
        if "index_" in request.url.path:
            return httpx.Response(200, json={"timestamps": [chunk]})
        return httpx.Response(200, content=chunk_body([(T0, 42.0)]))

    client = make_client(httpx.MockTransport(handler))
    now = T0 + timedelta(days=1)
    first = smard.ingest_series(con, client, PRICE, datetime(2026, 1, 1), workers=1, now=now)
    second = smard.ingest_series(con, client, PRICE, datetime(2026, 1, 1), workers=1, now=now)
    assert (first["changed"], second["changed"]) == (1, 0)
