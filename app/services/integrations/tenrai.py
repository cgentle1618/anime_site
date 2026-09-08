"""
tenrai.py
Handles all HTTP interactions with the external Tenrai v1 API.
Strictly responsible for fetching raw external JSON data and handling rate limits (429).
"""

import logging
import time
from typing import Any, Dict, Optional

import requests
from tenacity import (
    retry,
    retry_if_exception_type,
    stop_after_attempt,
    wait_exponential,
)

logger = logging.getLogger(__name__)

# Constants for MyAnimeList's Unofficial API
TENRAI_BASE_URL = "https://api.tenrai.org/v1"


class TenraiRateLimiter:
    """
    Sliding-window throttle for the Tenrai v1 API.

    Tenrai enforces two limits at once — 4 requests per second and 120 requests
    per minute — so one window is not enough. Every window is checked before each
    request and the caller sleeps until all of them have room.
    """

    # (max_requests, time_window_seconds)
    DEFAULT_LIMITS = ((4, 1), (120, 60))

    def __init__(self, limits=None):
        self.limits = tuple(limits) if limits else self.DEFAULT_LIMITS
        self.max_window = max(window for _, window in self.limits)
        self.request_timestamps = []

    def _sleep_time(self, now: float) -> float:
        """Longest wait any window demands before another request may go out."""
        sleep_time = 0.0
        for max_requests, window in self.limits:
            recent = [t for t in self.request_timestamps if now - t < window]
            if len(recent) >= max_requests:
                # The request that must expire before this window frees a slot.
                blocking = recent[len(recent) - max_requests]
                sleep_time = max(sleep_time, window - (now - blocking))
        return sleep_time

    def wait_if_needed(self):
        while True:
            now = time.time()
            # Drop timestamps older than the widest window — they constrain nothing.
            self.request_timestamps = [
                t for t in self.request_timestamps if now - t < self.max_window
            ]

            sleep_time = self._sleep_time(now)
            if sleep_time <= 0:
                break

            logger.info(
                f"Tenrai Rate Limiter: limit reached. Pausing for {sleep_time:.2f} seconds."
            )
            time.sleep(sleep_time)

        self.request_timestamps.append(time.time())


# Global instance shared across the application
tenrai_rate_limiter = TenraiRateLimiter()


class RateLimitExceeded(Exception):
    pass


@retry(
    stop=stop_after_attempt(5),
    wait=wait_exponential(multiplier=1, min=2, max=10),
    retry=(
        retry_if_exception_type(requests.exceptions.RequestException)
        | retry_if_exception_type(RateLimitExceeded)
    ),
    reraise=False,
)
def fetch_tenrai_anime_data(mal_id: int) -> Optional[Dict[str, Any]]:
    """
    Fetches raw anime details from Tenrai.
    Works for anime and anime movie entries.
    Includes sliding window throttling and exponential backoff retry mechanism.
    """
    if not mal_id:
        return None

    # Proactive Throttling
    tenrai_rate_limiter.wait_if_needed()

    url = f"{TENRAI_BASE_URL}/anime/{mal_id}/full"

    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) MediaTracker/1.0"
    }

    try:
        response = requests.get(url, headers=headers, timeout=15)

        if response.status_code == 429:
            logger.warning(f"Tenrai Rate Limit (429) for MAL ID {mal_id}.")
            raise RateLimitExceeded("429 Too Many Requests")

        if response.status_code == 404:
            logger.warning(f"Anime not found (404) on Tenrai for MAL ID {mal_id}")
            return None

        if response.status_code >= 500:
            logger.warning(
                f"Tenrai server error ({response.status_code}) for MAL ID {mal_id} — skipping retries."
            )
            return None

        response.raise_for_status()

        return response.json().get("data", {})

    except requests.exceptions.RequestException as e:
        logger.error(
            f"Network/Timeout Error connecting to Tenrai for MAL ID {mal_id}: {e}"
        )
        # Raise to trigger tenacity's reactive Exponential Backoff
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
def fetch_tenrai_manga_novel_data(mal_id: int) -> Optional[Dict[str, Any]]:
    """
    Fetches raw manga details from Tenrai.
    Uses the same TenraiRateLimiter and retry configuration as fetch_tenrai_anime_data.
    """
    if not mal_id:
        return None

    tenrai_rate_limiter.wait_if_needed()

    url = f"{TENRAI_BASE_URL}/manga/{mal_id}/full"

    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) MediaTracker/1.0"
    }

    try:
        response = requests.get(url, headers=headers, timeout=15)

        if response.status_code == 429:
            logger.warning(f"Tenrai Rate Limit (429) for Manga MAL ID {mal_id}.")
            raise RateLimitExceeded("429 Too Many Requests")

        if response.status_code == 404:
            logger.warning(f"Manga not found (404) on Tenrai for MAL ID {mal_id}")
            return None

        if response.status_code >= 500:
            logger.warning(
                f"Tenrai server error ({response.status_code}) for Manga MAL ID {mal_id} — skipping retries."
            )
            return None

        response.raise_for_status()

        return response.json().get("data", {})

    except requests.exceptions.RequestException as e:
        logger.error(
            f"Network/Timeout Error connecting to Tenrai for Manga MAL ID {mal_id}: {e}"
        )
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
def fetch_tenrai_producer_data(mal_id: int) -> Optional[Dict[str, Any]]:
    """
    Fetches raw studio (MAL "producer") details from Tenrai.

    Producers are a different resource from anime and manga - they carry a
    logo, an `established` timestamp and an `external` link list, and no
    score or rank - but the throttle and retry policy are identical, so the
    same TenraiRateLimiter budget covers all three fetchers.
    """
    if not mal_id:
        return None

    tenrai_rate_limiter.wait_if_needed()

    url = f"{TENRAI_BASE_URL}/producers/{mal_id}/full"

    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) MediaTracker/1.0"
    }

    try:
        response = requests.get(url, headers=headers, timeout=15)

        if response.status_code == 429:
            logger.warning(f"Tenrai Rate Limit (429) for Producer MAL ID {mal_id}.")
            raise RateLimitExceeded("429 Too Many Requests")

        if response.status_code == 404:
            logger.warning(f"Producer not found (404) on Tenrai for MAL ID {mal_id}")
            return None

        if response.status_code >= 500:
            logger.warning(
                f"Tenrai server error ({response.status_code}) for Producer MAL ID {mal_id} — skipping retries."
            )
            return None

        response.raise_for_status()

        return response.json().get("data", {})

    except requests.exceptions.RequestException as e:
        logger.error(
            f"Network/Timeout Error connecting to Tenrai for Producer MAL ID {mal_id}: {e}"
        )
        raise
