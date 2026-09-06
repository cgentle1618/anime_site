"""Steam transport: throttling, the two hosts, and how failures degrade."""

import pytest
import requests

from app.services.integrations import steam


class FakeResponse:
    def __init__(self, status_code=200, payload=None):
        self.status_code = status_code
        self._payload = payload if payload is not None else {}

    def json(self):
        return self._payload

    def raise_for_status(self):
        if self.status_code >= 400:
            raise requests.exceptions.HTTPError(str(self.status_code))


APPDETAILS = {
    "1245620": {
        "success": True,
        "data": {
            "name": "ELDEN RING",
            "is_free": False,
            "metacritic": {"score": 96},
            "achievements": {"total": 42},
            "price_overview": {"currency": "USD", "initial": 5999, "final": 3599},
        },
    }
}


@pytest.fixture(autouse=True)
def no_throttle_and_no_cache(monkeypatch):
    monkeypatch.setattr(steam.steam_store_rate_limiter, "wait_if_needed", lambda: None)
    steam.reset_owned_games_cache()


class TestAppDetails:
    def test_the_data_block_is_unwrapped_from_the_appid_key(self, monkeypatch):
        monkeypatch.setattr(
            steam.requests, "get", lambda url, **k: FakeResponse(200, APPDETAILS)
        )
        data = steam.fetch_steam_appdetails(1245620)
        assert data["metacritic"]["score"] == 96

    def test_the_region_is_sent_as_cc(self, monkeypatch):
        seen = {}

        def fake_get(url, **kwargs):
            seen.update(kwargs.get("params") or {})
            return FakeResponse(200, APPDETAILS)

        monkeypatch.setattr(steam.requests, "get", fake_get)
        steam.fetch_steam_appdetails(1245620, cc="jp")
        assert seen["cc"] == "jp"

    def test_an_unsuccessful_entry_is_a_none_not_a_crash(self, monkeypatch):
        """A delisted or region-locked app answers success: false."""
        monkeypatch.setattr(
            steam.requests,
            "get",
            lambda url, **k: FakeResponse(200, {"1245620": {"success": False}}),
        )
        assert steam.fetch_steam_appdetails(1245620) is None

    def test_a_timeout_is_set_on_every_call(self, monkeypatch):
        seen = {}

        def fake_get(url, **kwargs):
            seen[url] = kwargs.get("timeout")
            return FakeResponse(200, APPDETAILS)

        monkeypatch.setattr(steam.requests, "get", fake_get)
        steam.fetch_steam_appdetails(1245620)
        assert all(t == 15 for t in seen.values())


class TestStoreFailures:
    """Against the private helper, so tenacity's backoff never runs."""

    def test_a_429_raises_so_tenacity_backs_off(self, monkeypatch):
        monkeypatch.setattr(steam.requests, "get", lambda url, **k: FakeResponse(429))
        with pytest.raises(steam.RateLimitExceeded):
            steam._store_request("appdetails", {}, context="test")

    def test_a_500_returns_none_without_retrying(self, monkeypatch):
        monkeypatch.setattr(steam.requests, "get", lambda url, **k: FakeResponse(503))
        assert steam._store_request("appdetails", {}, context="test") is None


class TestWebApi:
    def test_without_credentials_the_progress_calls_are_skipped(self, monkeypatch):
        monkeypatch.setattr(steam.settings, "steam_api_key", None)
        monkeypatch.setattr(steam.settings, "steam_id", "76561197960287930")

        def explode(*args, **kwargs):
            raise AssertionError("no HTTP call may go out without credentials")

        monkeypatch.setattr(steam.requests, "get", explode)
        assert steam.fetch_owned_games() is None
        assert steam.fetch_player_achievements(1245620) is None

    def test_without_credentials_the_warning_is_logged_only_once_per_run(self, monkeypatch, caplog):
        """A 300-game Fill calls fetch_owned_games once and
        fetch_player_achievements once per entry; without throttling, every
        one of those calls re-logs the missing-credentials warning. The
        module promises one per run, so repeated calls across both functions
        must not repeat it."""
        monkeypatch.setattr(steam.settings, "steam_api_key", None)
        monkeypatch.setattr(steam.settings, "steam_id", None)

        with caplog.at_level("WARNING", logger="app.services.integrations.steam"):
            steam.fetch_owned_games()
            for appid in (1245620, 570, 730):
                steam.fetch_player_achievements(appid)

        warnings = [r for r in caplog.records if "STEAM_API_KEY" in r.message]
        assert len(warnings) == 1

        # reset_owned_games_cache() starts the next run clean, so the
        # warning is allowed to fire again after it.
        caplog.clear()
        steam.reset_owned_games_cache()
        with caplog.at_level("WARNING", logger="app.services.integrations.steam"):
            steam.fetch_owned_games()
        assert len([r for r in caplog.records if "STEAM_API_KEY" in r.message]) == 1

    def test_owned_games_maps_appid_to_minutes(self, monkeypatch):
        monkeypatch.setattr(steam.settings, "steam_api_key", "key")
        monkeypatch.setattr(steam.settings, "steam_id", "76561197960287930")
        monkeypatch.setattr(
            steam.requests,
            "get",
            lambda url, **k: FakeResponse(
                200,
                {"response": {"games": [{"appid": 1245620, "playtime_forever": 180}]}},
            ),
        )
        assert steam.fetch_owned_games() == {1245620: 180}

    def test_the_library_is_fetched_once_and_then_cached(self, monkeypatch):
        monkeypatch.setattr(steam.settings, "steam_api_key", "key")
        monkeypatch.setattr(steam.settings, "steam_id", "76561197960287930")
        calls = {"n": 0}

        def fake_get(url, **kwargs):
            calls["n"] += 1
            return FakeResponse(200, {"response": {"games": []}})

        monkeypatch.setattr(steam.requests, "get", fake_get)
        steam.fetch_owned_games()
        steam.fetch_owned_games()
        assert calls["n"] == 1, "a Fill run costs one library call, not one per game"

    def test_the_cache_is_refetched_once_the_ttl_expires(self, monkeypatch):
        monkeypatch.setattr(steam.settings, "steam_api_key", "key")
        monkeypatch.setattr(steam.settings, "steam_id", "76561197960287930")
        calls = {"n": 0}

        def fake_get(url, **kwargs):
            calls["n"] += 1
            return FakeResponse(200, {"response": {"games": []}})

        monkeypatch.setattr(steam.requests, "get", fake_get)
        steam.fetch_owned_games()
        # Push the cached fetch time back past OWNED_CACHE_TTL so the next
        # call sees it as stale rather than fresh.
        steam._OWNED_CACHE["fetched_at"] -= steam.OWNED_CACHE_TTL + 1
        steam.fetch_owned_games()
        assert calls["n"] == 2, "a stale cache must be refetched, not reused forever"

    def test_a_private_profile_response_is_not_refetched_per_entry(self, monkeypatch):
        """games is None (a private profile) must be cached too, not just a
        successful list - otherwise every entry in a Fill run issues its own
        GetOwnedGames request for the same negative answer."""
        monkeypatch.setattr(steam.settings, "steam_api_key", "key")
        monkeypatch.setattr(steam.settings, "steam_id", "76561197960287930")
        calls = {"n": 0}

        def fake_get(url, **kwargs):
            calls["n"] += 1
            return FakeResponse(200, {"response": {}})  # no "games" key: private profile

        monkeypatch.setattr(steam.requests, "get", fake_get)
        assert steam.fetch_owned_games() is None
        assert steam.fetch_owned_games() is None
        assert calls["n"] == 1, "a cached private-profile answer must not be refetched per entry"

    def test_a_private_profile_yields_none_rather_than_zero(self, monkeypatch):
        """An empty playerstats block must not read as 'zero achievements'."""
        monkeypatch.setattr(steam.settings, "steam_api_key", "key")
        monkeypatch.setattr(steam.settings, "steam_id", "76561197960287930")
        monkeypatch.setattr(
            steam.requests,
            "get",
            lambda url, **k: FakeResponse(200, {"playerstats": {"success": False}}),
        )
        assert steam.fetch_player_achievements(1245620) is None

    def test_unlocked_achievements_are_counted(self, monkeypatch):
        monkeypatch.setattr(steam.settings, "steam_api_key", "key")
        monkeypatch.setattr(steam.settings, "steam_id", "76561197960287930")
        monkeypatch.setattr(
            steam.requests,
            "get",
            lambda url, **k: FakeResponse(
                200,
                {
                    "playerstats": {
                        "success": True,
                        "achievements": [
                            {"achieved": 1},
                            {"achieved": 0},
                            {"achieved": 1},
                        ],
                    }
                },
            ),
        )
        assert steam.fetch_player_achievements(1245620) == 2


class TestRateLimiter:
    def test_the_window_blocks_the_request_after_the_limit(self):
        limiter = steam.SteamStoreRateLimiter(limits=((2, 300),))
        limiter.request_timestamps = [1000.0, 1001.0]
        # Two in the window already, so a third must wait out the remainder.
        assert limiter._sleep_time(1002.0) > 0

    def test_an_empty_window_never_sleeps(self):
        limiter = steam.SteamStoreRateLimiter(limits=((2, 300),))
        assert limiter._sleep_time(1002.0) == 0
