"""Energy-Charts fallback for days SMARD leaves empty. All values are SYNTHETIC SAMPLE DATA."""

import json
from datetime import date, datetime, timedelta

import httpx
import pytest
from conftest import chunk_body

from epf.clean.smard import build_series
from epf.config import SERIES_BY_ID
from epf.ingest import energycharts, smard
from epf.ingest.http import Response, make_client
from epf.ingest.raw import store
from epf.timeutil import delivery_bounds_utc, utc_to_ms

HOURLY = SERIES_BY_ID["price_da_60"]
QUARTER = SERIES_BY_ID["price_da_15"]
DAY = date(2026, 11, 21)
START, END = delivery_bounds_utc(DAY)  # 2026-11-20 23:00 to 2026-11-21 23:00 UTC


def _quarters(start: datetime, end: datetime) -> list[datetime]:
    out, t = [], start
    while t < end:
        out.append(t)
        t += timedelta(minutes=15)
    return out


def _ec_body(points: list[tuple[datetime, float | None]]) -> bytes:
    return json.dumps(
        {
            "license_info": "CC BY 4.0",
            "unix_seconds": [utc_to_ms(t) // 1000 for t, _ in points],
            "price": [v for _, v in points],
            "unit": "EUR / MWh",
        }
    ).encode()


def _response(body: bytes, url: str = "https://example.test") -> Response:
    return Response(url, 200, body, None, None)


def _store_smard(con, series, points, fetched_at=datetime(2026, 11, 22)):
    key = smard.chunk_key(series, utc_to_ms(START))
    store(con, "smard", key, _response(chunk_body(points)), fetched_at=fetched_at)


def _store_ec(con, day, points, fetched_at=datetime(2026, 11, 27)):
    store(
        con,
        energycharts.SOURCE,
        energycharts.request_key(day),
        _response(_ec_body(points)),
        fetched_at=fetched_at,
    )


def _values(con, series_id):
    return dict(
        con.execute(
            "SELECT valid_from_utc, value FROM clean_series WHERE series_id = ?", [series_id]
        ).fetchall()
    )


def test_parse_reads_quarter_hours():
    t = datetime(2026, 11, 20, 23, 0)
    points = energycharts.parse(_ec_body([(t, 50.5), (t + timedelta(minutes=15), None)]))
    assert points == [(t, 50.5), (t + timedelta(minutes=15), None)]


@pytest.mark.parametrize(
    "body",
    [
        b"not json",
        b'{"price": [1.0]}',
        b'{"unix_seconds": [1, 2], "price": [1.0]}',
        b'{"unix_seconds": [1], "price": ["x"]}',
    ],
)
def test_parse_rejects_malformed(body):
    with pytest.raises(energycharts.EnergyChartsParseError):
        energycharts.parse(body)


def test_day_url_covers_the_berlin_day_inclusive():
    url = energycharts.day_url(DAY)
    assert "bzn=DE-LU" in url
    assert "start=2026-11-20T23:00Z" in url and "end=2026-11-21T22:45Z" in url


def test_empty_smard_day_is_filled_from_energy_charts(con):
    quarters = _quarters(START, END)
    _store_smard(con, QUARTER, [(t, None) for t in quarters])
    _store_smard(con, HOURLY, [(t, None) for t in quarters[::4]])
    _store_ec(con, DAY, [(t, 100.0 + i) for i, t in enumerate(quarters)])
    build_series(con, QUARTER)
    build_series(con, HOURLY)
    q, h = _values(con, "price_da_15"), _values(con, "price_da_60")
    assert len(q) == 96 and q[START] == 100.0
    assert len(h) == 24
    assert h[START] == 101.5  # mean of 100, 101, 102, 103


def test_smard_values_are_never_overridden(con):
    quarters = _quarters(START, END)
    _store_smard(con, QUARTER, [(t, 10.0) for t in quarters])
    _store_ec(con, DAY, [(t, 99.0) for t in quarters])
    build_series(con, QUARTER)
    assert set(_values(con, "price_da_15").values()) == {10.0}


def test_partial_hour_is_not_averaged(con):
    quarters = _quarters(START, START + timedelta(hours=1))
    _store_ec(con, DAY, [(quarters[0], 1.0), (quarters[1], 2.0), (quarters[2], 3.0)])
    build_series(con, HOURLY)
    assert _values(con, "price_da_60") == {}


def test_fallback_is_traceable_to_its_raw_response(con):
    quarters = _quarters(START, END)
    _store_ec(con, DAY, [(t, 5.0) for t in quarters])
    build_series(con, QUARTER)
    sources = con.execute(
        """SELECT DISTINCT r.source FROM clean_series c JOIN raw_response r ON r.id = c.raw_id
           WHERE c.series_id = 'price_da_15'"""
    ).fetchall()
    assert sources == [("energy_charts",)]


def test_fill_gaps_fetches_only_incomplete_days(con):
    now = datetime(2026, 11, 22, 9, 0)  # Berlin day 22 Nov
    complete = DAY + timedelta(days=1)
    c_start, c_end = delivery_bounds_utc(complete)
    first_day = now.date() - timedelta(days=energycharts.LOOKBACK_DAYS)
    f_start, _ = delivery_bounds_utc(first_day)
    # SMARD complete from the first lookback day through 22 Nov, except 21 Nov.
    smard_points = [(t, 1.0) for t in _quarters(f_start, START)] + [
        (t, 1.0) for t in _quarters(c_start, c_end)
    ]
    _store_smard(con, QUARTER, smard_points)
    build_series(con, QUARTER)
    assert energycharts.gap_days(con, now) == [DAY]

    requested = []

    def handler(request: httpx.Request) -> httpx.Response:
        requested.append(str(request.url))
        return httpx.Response(200, content=_ec_body([(t, 7.0) for t in _quarters(START, END)]))

    with make_client(httpx.MockTransport(handler)) as client:
        assert energycharts.fill_gaps(con, client, now) == 1
    assert len(requested) == 1 and "2026-11-20T23:00Z" in requested[0]
    build_series(con, QUARTER)
    assert energycharts.gap_days(con, now) == []
