"""The outside check of the public site. All forecast values are SYNTHETIC SAMPLE DATA."""

import json
from datetime import date, datetime

import httpx
import pytest

from epf.ingest.http import make_client
from epf.live import watchdog

NOON = datetime(2026, 6, 16, 10, 0)  # 12:00 Berlin, after the cutoff for 17 June
SITE = "https://site.test"


def forecast(day="2026-06-17", status="ok", hours=24):
    return {"delivery_date": day, "status": status, "hours": [{"p50": 1.0}] * hours}


def track(*days):
    return {"hours": [{"delivery_date": d} for d in days]}


@pytest.mark.parametrize(
    ("now", "expected"),
    [
        (datetime(2026, 6, 16, 9, 29), date(2026, 6, 16)),  # 11:29 CEST
        (datetime(2026, 6, 16, 9, 30), date(2026, 6, 17)),  # 11:30 CEST
        (datetime(2026, 1, 15, 10, 29), date(2026, 1, 15)),  # 11:29 CET
        (datetime(2026, 1, 15, 10, 30), date(2026, 1, 16)),  # 11:30 CET
        (datetime(2026, 6, 16, 22, 30), date(2026, 6, 17)),  # just after midnight in Berlin
    ],
)
def test_expected_delivery_follows_berlin_time(now, expected):
    assert watchdog.expected_delivery(now) == expected


def test_passes_when_forecast_is_published():
    assert "24 hours" in watchdog.check_forecast(forecast(), NOON)


def test_fails_when_nothing_is_published():
    with pytest.raises(watchdog.WatchdogFailure, match="no forecast"):
        watchdog.check_forecast(None, NOON)


def test_fails_on_a_stale_forecast():
    with pytest.raises(watchdog.WatchdogFailure, match="latest forecast is for 2026-06-16"):
        watchdog.check_forecast(forecast("2026-06-16"), NOON)


def test_fails_on_a_missed_day():
    with pytest.raises(watchdog.WatchdogFailure, match="recorded as missed"):
        watchdog.check_forecast(forecast(status="missed", hours=0), NOON)


def test_fails_on_an_empty_forecast():
    with pytest.raises(watchdog.WatchdogFailure, match="no hours"):
        watchdog.check_forecast(forecast(hours=0), NOON)


def test_score_passes_when_latest_forecast_is_scored():
    assert "scored" in watchdog.check_scored(forecast(), track("2026-06-17"), NOON)


def test_score_fails_without_a_track_record():
    with pytest.raises(watchdog.WatchdogFailure, match="no track record"):
        watchdog.check_scored(forecast(), None, NOON)


def test_score_fails_when_latest_forecast_is_unscored():
    with pytest.raises(watchdog.WatchdogFailure, match="newest score is 2026-06-16"):
        watchdog.check_scored(forecast(), track("2026-06-16"), NOON)


def _client(files: dict[str, object] | int):
    def handler(request: httpx.Request) -> httpx.Response:
        if isinstance(files, int):
            return httpx.Response(files)
        name = request.url.path.rsplit("/", 1)[-1]
        if name in files:
            return httpx.Response(200, content=json.dumps(files[name]))
        return httpx.Response(404)

    return make_client(httpx.MockTransport(handler))


def test_run_reads_the_public_files():
    client = _client({"tomorrow.json": forecast(), "track_record.json": track("2026-06-17")})
    assert "published" in watchdog.run("forecast", SITE, NOON, client)
    assert "scored" in watchdog.run("score", SITE, NOON, client)


def test_run_reports_a_missing_forecast():
    with pytest.raises(watchdog.WatchdogFailure, match="no forecast"):
        watchdog.run("forecast", SITE, NOON, _client({}))


def test_run_reports_a_site_that_is_down(monkeypatch):
    real_fetch = watchdog.fetch
    monkeypatch.setattr(
        watchdog, "fetch", lambda *a, **k: real_fetch(*a, **k, sleep=lambda _: None)
    )
    with pytest.raises(watchdog.WatchdogFailure, match="could not be read"):
        watchdog.run("forecast", SITE, NOON, _client(503))


def test_reach_needs_the_data_as_well_as_the_site():
    assert "reachable" in watchdog.run("reach", SITE, NOON, _client({"backtest.json": {}}))
    with pytest.raises(watchdog.WatchdogFailure, match="data is missing"):
        watchdog.run("reach", SITE, NOON, _client({}))
