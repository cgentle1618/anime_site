"""
The Open Library client: conditional fetching, and the failure classification
shared with the other metadata clients.

requests.get is patched throughout — the suite makes no live calls.
"""

import pytest
import requests

from app.services.integrations import openlibrary as ol


class FakeResponse:
    def __init__(self, status_code=200, payload=None):
        self.status_code = status_code
        self._payload = payload if payload is not None else {}

    def json(self):
        return self._payload

    def raise_for_status(self):
        if self.status_code >= 400:
            raise requests.exceptions.HTTPError(f"{self.status_code}")


WORK = {
    "title": "The Final Empire",
    "covers": [14658160],
    "authors": [{"author": {"key": "/authors/OL1394865A"}}],
}
EDITIONS = {"entries": [{"publish_date": "2006"}, {"publish_date": "July 2015"}]}
AUTHOR = {"name": "Brandon Sanderson"}


@pytest.fixture
def router(monkeypatch):
    """Serves canned payloads by URL and records every path requested."""
    calls = []

    def fake_get(url, headers=None, timeout=None, **kwargs):
        calls.append(url)
        if "/editions.json" in url:
            return FakeResponse(200, EDITIONS)
        if "/authors/" in url:
            return FakeResponse(200, AUTHOR)
        return FakeResponse(200, WORK)

    monkeypatch.setattr(ol.requests, "get", fake_get)
    monkeypatch.setattr(ol.openlibrary_rate_limiter, "wait_if_needed", lambda: None)
    return calls


class TestFetchOpenlibraryWork:
    def test_returns_work_editions_and_authors(self, router):
        result = ol.fetch_openlibrary_work("OL5738148W")
        assert result["work"]["title"] == "The Final Empire"
        assert len(result["editions"]) == 2
        assert result["authors"] == [AUTHOR]

    def test_sends_an_identifying_user_agent(self, monkeypatch):
        seen = {}

        def fake_get(url, headers=None, timeout=None, **kwargs):
            seen["headers"] = headers
            seen["timeout"] = timeout
            return FakeResponse(200, WORK)

        monkeypatch.setattr(ol.requests, "get", fake_get)
        monkeypatch.setattr(ol.openlibrary_rate_limiter, "wait_if_needed", lambda: None)
        ol.fetch_openlibrary_work("OL5738148W", want_editions=False, want_authors=False)
        assert seen["headers"]["User-Agent"] == ol.OPENLIBRARY_USER_AGENT
        assert seen["timeout"] == 15

    def test_skips_the_editions_call_when_not_wanted(self, router):
        ol.fetch_openlibrary_work("OL5738148W", want_editions=False)
        assert not any("/editions.json" in url for url in router)

    def test_skips_the_author_calls_when_not_wanted(self, router):
        ol.fetch_openlibrary_work("OL5738148W", want_authors=False)
        assert not any("/authors/" in url for url in router)

    def test_makes_exactly_one_call_when_neither_is_wanted(self, router):
        ol.fetch_openlibrary_work("OL5738148W", want_editions=False, want_authors=False)
        assert len(router) == 1

    def test_returns_none_for_a_falsy_work_id(self, router):
        assert ol.fetch_openlibrary_work("") is None
        assert router == []

    def test_returns_none_when_the_work_is_404(self, monkeypatch):
        monkeypatch.setattr(
            ol.requests, "get", lambda *a, **k: FakeResponse(404, {})
        )
        monkeypatch.setattr(ol.openlibrary_rate_limiter, "wait_if_needed", lambda: None)
        assert ol.fetch_openlibrary_work("OL5738148W") is None

    def test_returns_none_on_a_server_error_without_retrying(self, monkeypatch):
        calls = []

        def fake_get(*a, **k):
            calls.append(1)
            return FakeResponse(503, {})

        monkeypatch.setattr(ol.requests, "get", fake_get)
        monkeypatch.setattr(ol.openlibrary_rate_limiter, "wait_if_needed", lambda: None)
        assert ol.fetch_openlibrary_work("OL5738148W") is None
        assert len(calls) == 1

    def test_a_429_raises_rate_limit_exceeded_from_the_inner_request(self, monkeypatch):
        monkeypatch.setattr(ol.requests, "get", lambda *a, **k: FakeResponse(429, {}))
        monkeypatch.setattr(ol.openlibrary_rate_limiter, "wait_if_needed", lambda: None)
        with pytest.raises(ol.RateLimitExceeded):
            ol._request("/works/OL5738148W.json", "work OL5738148W")

    def test_an_author_entry_without_a_key_is_skipped(self, monkeypatch):
        def fake_get(url, headers=None, timeout=None, **kwargs):
            if "/editions.json" in url:
                return FakeResponse(200, EDITIONS)
            return FakeResponse(200, {"title": "X", "covers": [], "authors": [{}]})

        monkeypatch.setattr(ol.requests, "get", fake_get)
        monkeypatch.setattr(ol.openlibrary_rate_limiter, "wait_if_needed", lambda: None)
        result = ol.fetch_openlibrary_work("OL5738148W")
        assert result["authors"] == []


class TestOpenLibraryRateLimiter:
    def test_has_capacity_until_the_window_is_full(self):
        limiter = ol.OpenLibraryRateLimiter(max_requests=2, time_window=60)
        assert limiter.has_capacity() is True
        limiter.wait_if_needed()
        limiter.wait_if_needed()
        assert limiter.has_capacity() is False
