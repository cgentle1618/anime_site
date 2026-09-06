"""
steam.py
Handles all HTTP interactions with Steam.

Strictly responsible for fetching raw external JSON. Two things here differ
from every other integration in this package:

1. **It is two services behind one module.** `store.steampowered.com/api` is
   the storefront: no key, no registration, and it carries prices, the
   Metacritic score and the achievement total. `api.steampowered.com` is the
   Web API: it needs a key and a steamid, and it carries this collection's own
   playtime and achievements earned. Either half can work while the other is
   unconfigured, and the storefront half needs no configuration at all.
2. **The storefront is undocumented.** Its ~200 requests per 5 minutes per IP
   is an observed ceiling, not a published one, so the limiter is deliberately
   conservative and the pipeline gets a `budget` - unlike IGDB, a long backfill
   really can run out of window and must stop cleanly rather than block.

`appdetails` returns `metacritic`, `achievements` and `price_overview` in one
response, so the non-price payload rides along with the `cc=us` call and the
other two regions are fetched for their prices alone: three calls per game,
not four.
"""

import logging
import time
from typing import Any, Dict, List, Optional

import requests
from tenacity import (
    retry,
    retry_if_exception_type,
    stop_after_attempt,
    wait_exponential,
)

from app.config import settings

logger = logging.getLogger(__name__)

STORE_BASE_URL = "https://store.steampowered.com/api"
WEB_API_BASE_URL = "https://api.steampowered.com"

# The library is one response for every game owned, so a call is cached for
# this many seconds rather than repeated per entry. A run shorter than this
# costs exactly one request; a run that outlives it pays one more and gets
# fresher data in exchange. reset_owned_games_cache() is how a pipeline run
# starts clean instead of waiting out the clock.
OWNED_CACHE_TTL = 300


class SteamStoreRateLimiter:
    """
    Sliding-window throttle for the Steam storefront.

    ~200 requests per 5 minutes per IP, observed rather than documented. Unlike
    IGDB's 4/second this is a window a real backfill can exhaust, which is why
    the game pipeline carries a `budget` that stops the run when it does.
    """

    # (max_requests, time_window_seconds)
    DEFAULT_LIMITS = ((200, 300),)

    def __init__(self, limits=None):
        self.limits = tuple(limits) if limits else self.DEFAULT_LIMITS
        self.max_window = max(window for _, window in self.limits)
        self.request_timestamps: List[float] = []

    def _sleep_time(self, now: float) -> float:
        """Longest wait any window demands before another request may go out."""
        sleep_time = 0.0
        for max_requests, window in self.limits:
            recent = [t for t in self.request_timestamps if now - t < window]
            if len(recent) >= max_requests:
                blocking = recent[len(recent) - max_requests]
                sleep_time = max(sleep_time, window - (now - blocking))
        return sleep_time

    def wait_if_needed(self):
        while True:
            now = time.time()
            self.request_timestamps = [
                t for t in self.request_timestamps if now - t < self.max_window
            ]

            sleep_time = self._sleep_time(now)
            if sleep_time <= 0:
                break

            logger.info(f"Steam Rate Limiter: pausing for {sleep_time:.2f} seconds.")
            time.sleep(sleep_time)

        self.request_timestamps.append(time.time())

    def has_capacity(self) -> bool:
        """The pipeline's `budget`: False once the window is spent."""
        return self._sleep_time(time.time()) <= 0


# Global instance shared across the application
steam_store_rate_limiter = SteamStoreRateLimiter()

# {"games": {appid: minutes} | None, "fetched_at": float}. "games" is absent
# entirely until the first fetch; a bare `None` value means "fetched, and the
# answer was negative" (no credentials, or a private profile) - that outcome
# is cached too, on the same TTL as a success, so it is not indistinguishable
# from "not yet fetched" and does not trigger a fresh request or warning on
# every subsequent call. _UNSET is the sentinel that tells the two apart.
_UNSET = object()
_OWNED_CACHE: Dict[str, Any] = {}

# Sticky for the run: once _credentials() has warned, it stays quiet until
# reset_owned_games_cache() clears it. Both fetch_owned_games and
# fetch_player_achievements call _credentials(), and the latter is called
# once per entry - without this, a 300-game Fill with no credentials set
# would log the same warning ~600 times instead of the one the module
# promises.
_credentials_warned = False


class RateLimitExceeded(Exception):
    pass


def reset_owned_games_cache() -> None:
    """Drops the cached library and re-arms the missing-credentials warning.
    Called at the start of a pipeline run."""
    global _credentials_warned
    _OWNED_CACHE.clear()
    _credentials_warned = False


def _store_request(path: str, params: Dict[str, Any], context: str) -> Optional[Any]:
    """
    Issues one throttled storefront request and returns the parsed JSON.
    Returns None on any non-retryable failure; raises for retryable ones.
    """
    steam_store_rate_limiter.wait_if_needed()

    try:
        response = requests.get(f"{STORE_BASE_URL}/{path}", params=params, timeout=15)

        if response.status_code == 404:
            logger.warning(f"Steam has no such resource (404) for {context}.")
            return None

        if response.status_code == 429:
            logger.warning(f"Steam rate limit (429) for {context}.")
            raise RateLimitExceeded("429 Too Many Requests")

        if response.status_code >= 500:
            logger.warning(
                f"Steam server error ({response.status_code}) for {context} — skipping retries."
            )
            return None

        response.raise_for_status()

        return response.json()

    except requests.exceptions.RequestException as e:
        logger.error(f"Network/Timeout Error connecting to Steam for {context}: {e}")
        raise


def _credentials() -> Optional[tuple]:
    """
    The Web API key and steamid, or None when either is unset. The storefront
    half is unaffected: a missing credential costs only personal progress.

    Called once per entry (by fetch_player_achievements) plus once per run
    (by fetch_owned_games), so the missing-credentials warning is throttled
    to one per run via `_credentials_warned` rather than logged on every
    call - reset_owned_games_cache() re-arms it for the next run.
    """
    global _credentials_warned
    if not settings.steam_api_key or not settings.steam_id:
        if not _credentials_warned:
            logger.warning(
                "STEAM_API_KEY / STEAM_ID are not both set; Steam playtime and "
                "achievements earned will be skipped."
            )
            _credentials_warned = True
        return None
    return settings.steam_api_key, settings.steam_id


def _web_request(path: str, params: Dict[str, Any], context: str) -> Optional[Any]:
    """One Web API request. Not throttled: the documented quota is 100k/day."""
    try:
        response = requests.get(f"{WEB_API_BASE_URL}/{path}", params=params, timeout=15)

        if response.status_code in (401, 403):
            logger.warning(
                f"Steam refused the Web API request for {context} "
                f"({response.status_code}) — check the key and that the profile is public."
            )
            return None

        if response.status_code == 400:
            # A malformed steamid, not a transient fault. Retrying it five
            # times with backoff only delays the answer by ~30 seconds and
            # buries the cause under a tenacity RetryError, so this is caught
            # here and named. STEAM_ID must be the 64-bit form - 17 digits
            # beginning 7656119, the number in a /profiles/ URL - not the
            # vanity name from a /id/ URL and not a display name.
            logger.warning(
                f"Steam rejected the Web API request for {context} (400). "
                f"STEAM_ID is probably not a 64-bit steamid."
            )
            return None

        if response.status_code >= 500:
            logger.warning(f"Steam Web API server error for {context}.")
            return None

        response.raise_for_status()

        return response.json()

    except requests.exceptions.RequestException as e:
        logger.error(f"Network/Timeout Error connecting to the Steam Web API: {e}")
        raise


@retry(
    stop=stop_after_attempt(5),
    wait=wait_exponential(multiplier=1, min=2, max=10),
    retry=(
        retry_if_exception_type(requests.exceptions.RequestException)
        | retry_if_exception_type(RateLimitExceeded)
    ),
    reraise=False,
)
def fetch_steam_appdetails(appid: int, cc: str = "us") -> Optional[Dict[str, Any]]:
    """
    Fetches one app's storefront record for one country.

    The response is keyed by the appid as a string and carries its own success
    flag; a delisted or region-locked app answers `success: false`, which is an
    ordinary outcome and returns None.
    """
    payload = _store_request(
        "appdetails",
        {"appids": int(appid), "cc": cc, "l": "en"},
        context=f"app {appid} ({cc})",
    )
    if not payload:
        return None

    entry = payload.get(str(appid)) or {}
    if not entry.get("success"):
        logger.info(f"Steam has no storefront record for app {appid} in {cc}.")
        return None

    return entry.get("data")


@retry(
    stop=stop_after_attempt(5),
    wait=wait_exponential(multiplier=1, min=2, max=10),
    retry=retry_if_exception_type(requests.exceptions.RequestException),
    reraise=False,
)
def fetch_owned_games() -> Optional[Dict[int, int]]:
    """
    Every owned game as {appid: minutes played}, or None when the library is
    unreachable this run - no credentials, or a private profile.

    One response covers the whole library, so it is fetched once and cached
    for OWNED_CACHE_TTL seconds rather than requested per entry: a typical run
    costs exactly one request. That applies equally to a negative answer -
    without credentials, or with a private profile, the None is cached too,
    so a 300-game Fill attempts the library once and not 300 times. A run
    that outlives the TTL pays one more request (success or failure alike)
    and gets a fresh answer in exchange. reset_owned_games_cache() is the
    explicit way a pipeline run starts clean.
    """
    cached = _OWNED_CACHE.get("games", _UNSET)
    if cached is not _UNSET and time.time() - _OWNED_CACHE.get("fetched_at", 0) < OWNED_CACHE_TTL:
        return cached

    credentials = _credentials()
    if not credentials:
        _OWNED_CACHE["games"] = None
        _OWNED_CACHE["fetched_at"] = time.time()
        return None
    key, steamid = credentials

    payload = _web_request(
        "IPlayerService/GetOwnedGames/v1/",
        {
            "key": key,
            "steamid": steamid,
            "include_played_free_games": 1,
            "format": "json",
        },
        context="owned games",
    )

    games = ((payload or {}).get("response") or {}).get("games")
    if games is None:
        logger.warning(
            "Steam returned no game list — the profile's game details are "
            "probably not public."
        )
        _OWNED_CACHE["games"] = None
        _OWNED_CACHE["fetched_at"] = time.time()
        return None

    owned = {
        int(g["appid"]): int(g.get("playtime_forever") or 0)
        for g in games
        if g.get("appid") is not None
    }
    _OWNED_CACHE["games"] = owned
    _OWNED_CACHE["fetched_at"] = time.time()
    return owned


@retry(
    stop=stop_after_attempt(5),
    wait=wait_exponential(multiplier=1, min=2, max=10),
    retry=retry_if_exception_type(requests.exceptions.RequestException),
    reraise=False,
)
def fetch_player_achievements(appid: int) -> Optional[int]:
    """
    How many of this app's achievements are unlocked, or None when the answer
    is unknowable - no credentials, a private profile, or a game with no
    achievement schema at all. None is not zero, and the caller must not treat
    it as one.
    """
    credentials = _credentials()
    if not credentials:
        return None
    key, steamid = credentials

    payload = _web_request(
        "ISteamUserStats/GetPlayerAchievements/v1/",
        {"key": key, "steamid": steamid, "appid": int(appid), "format": "json"},
        context=f"achievements for app {appid}",
    )

    stats = (payload or {}).get("playerstats") or {}
    if not stats.get("success"):
        return None

    achievements = stats.get("achievements")
    if not achievements:
        return None

    return sum(1 for a in achievements if a.get("achieved"))
