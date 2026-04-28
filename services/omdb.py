"""
omdb.py
Handles all HTTP interactions with the OMDb (Open Movie Database) API.
Strictly responsible for fetching raw external JSON data.
Used solely to retrieve IMDb rating, which TMDB does not provide.
"""

import logging
import os
import time
from typing import Any, Dict, Optional

from dotenv import load_dotenv
import requests
from tenacity import (
    retry,
    stop_after_attempt,
    wait_exponential,
    retry_if_exception_type,
)


load_dotenv()

logger = logging.getLogger(__name__)

OMDB_BASE_URL = "http://www.omdbapi.com"


class OMDbRateLimiter:
    """Sliding window daily quota tracker for the OMDb free tier (1000 requests/day)."""

    def __init__(self, max_requests: int = 1000, time_window: int = 86400):
        self.max_requests = max_requests
        self.time_window = time_window
        self.request_timestamps = []

    def wait_if_needed(self):
        now = time.time()
        self.request_timestamps = [
            t for t in self.request_timestamps if now - t < self.time_window
        ]

        if len(self.request_timestamps) >= self.max_requests:
            sleep_time = self.time_window - (now - self.request_timestamps[0])
            if sleep_time > 0:
                logger.warning(
                    f"OMDb Rate Limiter: Daily limit ({self.max_requests}) reached. "
                    f"Pausing for {sleep_time:.2f} seconds."
                )
                time.sleep(sleep_time)

        self.request_timestamps.append(time.time())


# Global instance shared across the application
omdb_rate_limiter = OMDbRateLimiter()


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
def fetch_omdb_data(imdb_id: str) -> Optional[Dict[str, Any]]:
    """
    Fetches title data from OMDb by IMDb ID (e.g. 'tt1234567').
    Used to retrieve imdb_rating, which TMDB does not provide.
    Includes daily quota tracking and exponential backoff retry.
    """
    if not imdb_id:
        return None

    api_key = os.getenv("OMDB_API_KEY")
    if not api_key:
        logger.error("OMDB_API_KEY environment variable is not set.")
        return None

    omdb_rate_limiter.wait_if_needed()

    params = {"i": imdb_id, "apikey": api_key}

    try:
        response = requests.get(OMDB_BASE_URL, params=params, timeout=15)

        if response.status_code == 401:
            logger.error("OMDb API key is invalid or unauthorized.")
            return None

        if response.status_code == 429:
            logger.warning(f"OMDb Rate Limit (429) for IMDb ID {imdb_tt_id}.")
            raise RateLimitExceeded("429 Too Many Requests")

        if response.status_code >= 500:
            logger.warning(
                f"OMDb server error ({response.status_code}) for IMDb ID {imdb_tt_id} — skipping retries."
            )
            return None

        response.raise_for_status()

        data = response.json()

        if data.get("Response") == "False":
            logger.warning(
                f"OMDb: Title not found for IMDb ID {imdb_tt_id}: {data.get('Error')}"
            )
            return None

        return data

    except requests.exceptions.RequestException as e:
        logger.error(
            f"Network/Timeout Error connecting to OMDb for IMDb ID {imdb_tt_id}: {e}"
        )
        raise
