import json
from datetime import datetime

import pytest

from epf.config import WEATHER_LOCATIONS, WEATHER_UNITS, WEATHER_VARIABLES
from epf.ingest.openmeteo import WeatherParseError, parse_run
from epf.ingest.smard import SmardParseError, parse_chunk, parse_index


def test_parse_index_sorts():
    assert parse_index(b'{"timestamps": [2000, 1000]}') == [1000, 2000]


@pytest.mark.parametrize(
    "body", [b"{}", b"not json", b'{"timestamps": []}', b'{"timestamps":["a"]}']
)
def test_parse_index_rejects_bad_payload(body):
    with pytest.raises(SmardParseError):
        parse_index(body)


def test_parse_chunk_keeps_negative_and_nulls():
    body = json.dumps({"series": [[1760000000000, -12.5], [1760003600000, None]]}).encode()
    rows = parse_chunk(body)
    assert rows[0] == (datetime(2025, 10, 9, 8, 53, 20), -12.5)
    assert rows[1][1] is None


@pytest.mark.parametrize(
    "body",
    [b"{}", b'{"series": [[1]]}', b'{"series": [["x", 1]]}', b'{"series": [[1, "high"]]}'],
)
def test_parse_chunk_rejects_bad_payload(body):
    with pytest.raises(SmardParseError):
        parse_chunk(body)


def _weather_block(loc, **overrides):
    block = {
        "latitude": loc.latitude,
        "longitude": loc.longitude,
        "utc_offset_seconds": 0,
        "hourly_units": dict(WEATHER_UNITS),
        "hourly": {
            "time": ["2026-01-01T00:00", "2026-01-01T01:00"],
            **{v: [None, 1.0] for v in WEATHER_VARIABLES},
        },
    }
    block.update(overrides)
    return block


def test_parse_run_matches_locations_in_request_order():
    body = json.dumps([_weather_block(x) for x in WEATHER_LOCATIONS]).encode()
    rows = parse_run(body)
    assert len(rows) == 2 * len(WEATHER_VARIABLES) * len(WEATHER_LOCATIONS)
    assert rows[0][1] == WEATHER_LOCATIONS[0].name
    assert rows[-1][1] == WEATHER_LOCATIONS[-1].name


def test_parse_run_rejects_wrong_units():
    blocks = [_weather_block(x) for x in WEATHER_LOCATIONS]
    blocks[0]["hourly_units"]["wind_speed_100m"] = "m/s"
    with pytest.raises(WeatherParseError, match="unit"):
        parse_run(json.dumps(blocks).encode())


def test_parse_run_rejects_non_utc_and_wrong_count():
    blocks = [_weather_block(x) for x in WEATHER_LOCATIONS]
    blocks[0]["utc_offset_seconds"] = 3600
    with pytest.raises(WeatherParseError, match="UTC"):
        parse_run(json.dumps(blocks).encode())
    with pytest.raises(WeatherParseError, match="locations"):
        parse_run(json.dumps(blocks[:2]).encode())
