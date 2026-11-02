"""Contract tests against the real APIs. Run with `uv run pytest -m live`; excluded from CI."""

from datetime import timedelta

import pytest

from epf.config import SERIES_BY_ID, WEATHER_LOCATIONS, WEATHER_MODEL
from epf.ingest.http import fetch, make_client
from epf.ingest.openmeteo import parse_run, request_params
from epf.ingest.smard import chunk_url, index_url, parse_chunk, parse_index
from epf.timeutil import utcnow

pytestmark = pytest.mark.live


def test_smard_price_contract():
    series = SERIES_BY_ID["price_da_60"]
    with make_client() as client:
        latest = parse_index(fetch(client, index_url(series)).body)[-1]
        rows = parse_chunk(fetch(client, chunk_url(series, latest)).body)
    assert len(rows) == 168


def test_open_meteo_single_run_contract():
    from epf.config import OPEN_METEO_SINGLE_RUNS

    run = (utcnow() - timedelta(days=2)).replace(hour=0, minute=0, second=0, microsecond=0)
    with make_client() as client:
        response = fetch(
            client, OPEN_METEO_SINGLE_RUNS, params=request_params(run, WEATHER_LOCATIONS)
        )
    assert parse_run(response.body), WEATHER_MODEL


def test_holidays_match_nager_for_national_days():
    from datetime import date

    import httpx

    from epf.ingest.holidays_de import build

    data = httpx.get("https://date.nager.at/api/v3/PublicHolidays/2026/DE", timeout=30).json()
    nager = {date.fromisoformat(x["date"]) for x in data if x["global"]}
    ours = {r[0] for r in build([2026]) if r[2]}
    assert ours == nager
