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
    stop_after_attempt,
    wait_exponential,
    retry_if_exception_type,
)

logger = logging.getLogger(__name__)

# Constants for MyAnimeList's Unofficial API
TENRAI_BASE_URL = "https://api.tenrai.org/v1"


class TenraiRateLimiter:
    def __init__(self, max_requests: int = 30, time_window: int = 60):
        self.max_requests = max_requests
        self.time_window = time_window
        self.request_timestamps = []

    def wait_if_needed(self):
        now = time.time()
        # Remove timestamps older than the time window (60s)
        self.request_timestamps = [
            t for t in self.request_timestamps if now - t < self.time_window
        ]

        if len(self.request_timestamps) >= self.max_requests:
            # Calculate how long to wait until the oldest request expires
            sleep_time = self.time_window - (now - self.request_timestamps[0])
            if sleep_time > 0:
                logger.info(
                    f"Tenrai Rate Limiter: Maximum requests ({self.max_requests}) reached. Pausing for {sleep_time:.2f} seconds."
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
