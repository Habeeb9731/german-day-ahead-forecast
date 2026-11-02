import httpx
import pytest

from epf.ingest.http import FetchError, fetch, make_client


def _client(responses):
    calls = iter(responses)

    def handler(request):
        item = next(calls)
        if isinstance(item, Exception):
            raise item
        return item

    return make_client(httpx.MockTransport(handler))


def test_retries_transient_then_succeeds():
    sleeps = []
    client = _client(
        [httpx.Response(503), httpx.ConnectError("boom"), httpx.Response(200, content=b"ok")]
    )
    r = fetch(client, "https://example.test/x", sleep=sleeps.append)
    assert r.body == b"ok"
    assert sleeps == [1.0, 2.0]


def test_honours_retry_after():
    sleeps = []
    client = _client(
        [httpx.Response(429, headers={"retry-after": "30"}), httpx.Response(200, content=b"ok")]
    )
    fetch(client, "https://example.test/x", sleep=sleeps.append)
    assert sleeps == [30.0]


def test_permanent_error_is_not_retried():
    sleeps = []
    with pytest.raises(FetchError):
        fetch(_client([httpx.Response(404)]), "https://example.test/x", sleep=sleeps.append)
    assert sleeps == []


def test_gives_up_after_attempts():
    client = _client([httpx.Response(500)] * 3)
    with pytest.raises(FetchError, match="gave up"):
        fetch(client, "https://example.test/x", attempts=3, sleep=lambda _: None)
