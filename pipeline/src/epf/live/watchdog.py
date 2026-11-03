"""Outside check of the public site, run from GitHub so that a failure emails the repo owner.

It only reads what visitors see. That also catches the server or tunnel being down, which an alert
sent from the server itself could never report.
"""

from __future__ import annotations

import json
from datetime import date, datetime, timedelta
from typing import Any

import httpx

from epf.features.asof import cutoff_for
from epf.ingest.http import FetchError, fetch, make_client
from epf.timeutil import delivery_date

DEFAULT_SITE = "https://depower.abdulhabeeb.com"


class WatchdogFailure(RuntimeError):
    """The public site does not show what it should by now."""


def expected_delivery(now: datetime) -> date:
    """The newest delivery date that should have a forecast by `now`."""
    tomorrow = delivery_date(now) + timedelta(days=1)
    return tomorrow if now >= cutoff_for(tomorrow) else delivery_date(now)


def check_forecast(tomorrow: dict[str, Any] | None, now: datetime) -> str:
    expected = expected_delivery(now)
    if tomorrow is None:
        raise WatchdogFailure(f"no forecast is published; expected delivery date {expected}")
    published = date.fromisoformat(tomorrow["delivery_date"])
    if published < expected:
        raise WatchdogFailure(f"latest forecast is for {published}; expected {expected}")
    if tomorrow["status"] != "ok":
        raise WatchdogFailure(f"the forecast for {published} was recorded as {tomorrow['status']}")
    if not tomorrow["hours"]:
        raise WatchdogFailure(f"the forecast for {published} has no hours")
    return f"forecast for {published} is published with {len(tomorrow['hours'])} hours"


def check_scored(
    tomorrow: dict[str, Any] | None, track_record: dict[str, Any] | None, now: datetime
) -> str:
    """By evening, day-ahead prices for the latest forecast are public, so it should be scored."""
    check_forecast(tomorrow, now)
    assert tomorrow is not None
    wanted = tomorrow["delivery_date"]
    if track_record is None:
        raise WatchdogFailure(f"no track record is published; expected a score for {wanted}")
    scored = {hour["delivery_date"] for hour in track_record["hours"]}
    if wanted not in scored:
        newest = max(scored) if scored else "none"
        raise WatchdogFailure(f"the forecast for {wanted} is not scored; newest score is {newest}")
    return f"forecast for {wanted} is scored"


def _get(client: httpx.Client, site: str, name: str) -> dict[str, Any] | None:
    """A published file, or None if it doesn't exist. Transient errors are retried by fetch()."""
    response = fetch(client, f"{site}/data/{name}", accept_status=frozenset({200, 404}))
    if response.status == 404:
        return None
    payload: dict[str, Any] = json.loads(response.body)
    return payload


def run(check: str, site: str, now: datetime, client: httpx.Client | None = None) -> str:
    """Run one check. "reach" only confirms that the site and its data can be read from here."""
    owned = client or make_client()
    try:
        if check == "reach":
            if _get(owned, site, "backtest.json") is None:
                raise WatchdogFailure("the site responded, but its data is missing")
            return "site and data are reachable"
        tomorrow = _get(owned, site, "tomorrow.json")
        if check == "forecast":
            return check_forecast(tomorrow, now)
        if check == "score":
            return check_scored(tomorrow, _get(owned, site, "track_record.json"), now)
        raise ValueError(f"unknown check: {check}")
    except FetchError as exc:
        raise WatchdogFailure(f"the site could not be read: {exc}") from exc
    finally:
        if client is None:
            owned.close()
