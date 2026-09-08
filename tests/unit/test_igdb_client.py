"""
The IGDB client: OAuth token caching, failure classification, throttling.

requests is patched throughout - the suite makes no live calls.
"""

import time

import pytest
import requests

from app.services.integrations import igdb


class FakeResponse:
    def __init__(self, status_code=200, payload=None):
        self.status_code = status_code
        self._payload = payload if payload is not None else {}

    def json(self):
        return self._payload

    def raise_for_status(self):
        if self.status_code >= 400:
            raise requests.exceptions.HTTPError(str(self.status_code))


GAME = {
    "id": 1029,
    "name": "Elden Ring",
    "first_release_date": 1645747200,
    "genres": [{"name": "Role-playing (RPG)"}],
}


@pytest.fixture(autouse=True)
def credentials(monkeypatch):
    monkeypatch.setattr(igdb.settings, "igdb_client_id", "cid")
    monkeypatch.setattr(igdb.settings, "igdb_client_secret", "secret")
    monkeypatch.setattr(igdb.igdb_rate_limiter, "wait_if_needed", lambda: None)
    igdb._TOKEN_CACHE.clear()


@pytest.fixture
def transport(monkeypatch):
    """Records every POST, serving a token for Twitch and data for IGDB."""
    calls = {"token": 0, "data": []}

    def fake_post(url, **kwargs):
        if "id.twitch.tv" in url:
            calls["token"] += 1
            return FakeResponse(200, {"access_token": "tok", "expires_in": 3600})
        calls["data"].append((url, kwargs.get("data"), kwargs.get("headers")))
        return FakeResponse(200, [GAME])

    monkeypatch.setattr(igdb.requests, "post", fake_post)
    return calls


class TestToken:
    def test_the_token_is_fetched_once_and_reused(self, transport):
        igdb.fetch_igdb_game(1029)
        igdb.fetch_igdb_game(1029)
        assert transport["token"] == 1

    def test_an_expired_token_is_refetched(self, transport, monkeypatch):
        igdb.fetch_igdb_game(1029)
        igdb._TOKEN_CACHE["expires_at"] = time.time() - 1
        igdb.fetch_igdb_game(1029)
        assert transport["token"] == 2

    def test_both_credentials_travel_on_every_data_request(self, transport):
        igdb.fetch_igdb_game(1029)
        _url, _body, headers = transport["data"][0]
        assert headers["Client-ID"] == "cid"
        assert headers["Authorization"] == "Bearer tok"

    def test_missing_credentials_degrade_to_none_without_calling_out(
        self, monkeypatch
    ):
        monkeypatch.setattr(igdb.settings, "igdb_client_id", None)

        def explode(*a, **k):
            raise AssertionError("must not call out without credentials")

        monkeypatch.setattr(igdb.requests, "post", explode)
        assert igdb.fetch_igdb_game(1029) is None


class TestFetch:
    def test_returns_the_first_result(self, transport):
        assert igdb.fetch_igdb_game(1029)["name"] == "Elden Ring"

    def test_a_missing_id_returns_none_without_a_request(self, transport):
        assert igdb.fetch_igdb_game(None) is None
        assert transport["data"] == []

    def test_an_empty_result_list_is_none(self, monkeypatch, transport):
        monkeypatch.setattr(
            igdb.requests,
            "post",
            lambda url, **k: FakeResponse(200, {"access_token": "t", "expires_in": 99})
            if "twitch" in url
            else FakeResponse(200, []),
        )
        assert igdb.fetch_igdb_game(1029) is None

    def test_a_429_raises_so_tenacity_backs_off(self, monkeypatch):
        monkeypatch.setattr(
            igdb.requests,
            "post",
            lambda url, **k: FakeResponse(200, {"access_token": "t", "expires_in": 99})
            if "twitch" in url
            else FakeResponse(429),
        )
        with pytest.raises(igdb.RateLimitExceeded):
            igdb._request("games", "fields name;", context="test")

    def test_a_500_returns_none_without_retrying(self, monkeypatch):
        monkeypatch.setattr(
            igdb.requests,
            "post",
            lambda url, **k: FakeResponse(200, {"access_token": "t", "expires_in": 99})
            if "twitch" in url
            else FakeResponse(503),
        )
        assert igdb._request("games", "fields name;", context="test") is None

    def test_a_timeout_is_set_on_every_call(self, monkeypatch):
        seen = {}

        def fake_post(url, **kwargs):
            seen[url] = kwargs.get("timeout")
            if "twitch" in url:
                return FakeResponse(200, {"access_token": "t", "expires_in": 99})
            return FakeResponse(200, [GAME])

        monkeypatch.setattr(igdb.requests, "post", fake_post)
        igdb.fetch_igdb_game(1029)
        assert all(t == 15 for t in seen.values())


class TestSearch:
    def test_an_empty_query_returns_an_empty_list(self, transport):
        assert igdb.search_igdb_games("   ") == []
        assert transport["data"] == []
