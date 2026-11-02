"""HTTP GET with bounded retries. Only transient failures are retried."""

from __future__ import annotations

import logging
import time
from collections.abc import Callable
from dataclasses import dataclass

import httpx

from epf.config import USER_AGENT

log = logging.getLogger(__name__)

RETRYABLE_STATUS = {408, 425, 429, 500, 502, 503, 504}


class FetchError(RuntimeError):
    """A request failed permanently or exhausted its retries."""


@dataclass(frozen=True)
class Response:
    url: str
    status: int
    body: bytes
    last_modified: str | None
    etag: str | None


def make_client(transport: httpx.BaseTransport | None = None) -> httpx.Client:
    return httpx.Client(
        headers={"User-Agent": USER_AGENT},
        timeout=httpx.Timeout(60.0),
        follow_redirects=True,
        transport=transport,
    )


def fetch(
    client: httpx.Client,
    url: str,
    *,
    params: dict[str, str | int] | None = None,
    attempts: int = 5,
    base_delay: float = 1.0,
    sleep: Callable[[float], None] = time.sleep,
    accept_status: frozenset[int] = frozenset({200}),
) -> Response:
    """GET a URL. Status codes in `accept_status` return; retryable failures back off and retry."""
    last_error = "no attempt made"
    for attempt in range(1, attempts + 1):
        delay = base_delay * 2 ** (attempt - 1)
        try:
            r = client.get(url, params=params)
        except httpx.TransportError as exc:
            last_error = f"{type(exc).__name__}: {exc}"
        else:
            if r.status_code in accept_status:
                return Response(
                    url=str(r.url),
                    status=r.status_code,
                    body=r.content,
                    last_modified=r.headers.get("last-modified"),
                    etag=r.headers.get("etag"),
                )
            last_error = f"HTTP {r.status_code}: {r.text[:200]}"
            if r.status_code not in RETRYABLE_STATUS:
                raise FetchError(f"{url}: {last_error}")
            retry_after = r.headers.get("retry-after", "")
            if retry_after.isdigit():
                delay = max(delay, float(retry_after))
        if attempt < attempts:
            log.warning(
                "retry %d/%d in %.0fs for %s: %s", attempt, attempts, delay, url, last_error
            )
            sleep(delay)
    raise FetchError(f"{url}: gave up after {attempts} attempts: {last_error}")
