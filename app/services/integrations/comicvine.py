"""
comicvine.py
Handles all HTTP interactions with the Comic Vine API.
Strictly responsible for fetching raw external JSON data.

A Comic Vine "volume" is one numbered run, so it is the entry point for a
`comic` row. Volume IDs are stored on the entry; titles are far too collision-
prone to match on ("Avengers" alone has dozens of volumes).
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

COMICVINE_BASE_URL = "https://comicvine.gamespot.com/api"

# Comic Vine rejects requests from default client agents outright, so this must
# be a real, identifying string rather than python-requests/x.y.
COMICVINE_USER_AGENT = "CG1618-Media-Tracker/1.0"

# The volume detail response is large. Requesting only what the mapper reads
# keeps responses small and stays well clear of the field-count limits.
VOLUME_FIELD_LIST = "id,name,start_year,count_of_issues,publisher,person_credits,image,site_detail_url"
SEARCH_FIELD_LIST = "id,name,start_year,count_of_issues,publisher,image,site_detail_url"


class ComicVineRateLimiter:
    """
    Sliding window rate limiter for the Comic Vine API (200 requests per hour).

    Far tighter than TMDB's 40/10s: a large backfill will not finish in one run,
    so callers should surface how many entries were left rather than block for
    the remainder of the hour.
    """

    def __init__(self, max_requests: int = 200, time_window: int = 3600):
        self.max_requests = max_requests
        self.time_window = time_window
        self.request_timestamps = []

    def has_capacity(self) -> bool:
        """Returns False when the next request would block on the hourly cap."""
        now = time.time()
        self.request_timestamps = [
            t for t in self.request_timestamps if now - t < self.time_window
        ]
        return len(self.request_timestamps) < self.max_requests

    def wait_if_needed(self):
        now = time.time()
        self.request_timestamps = [
            t for t in self.request_timestamps if now - t < self.time_window
        ]

        if len(self.request_timestamps) >= self.max_requests:
            sleep_time = self.time_window - (now - self.request_timestamps[0])
            if sleep_time > 0:
                logger.warning(
                    f"Comic Vine Rate Limiter: Hourly limit ({self.max_requests}) reached. "
                    f"Pausing for {sleep_time:.2f} seconds."
                )
                time.sleep(sleep_time)

        self.request_timestamps.append(time.time())


# Global instance shared across the application
comicvine_rate_limiter = ComicVineRateLimiter()


class RateLimitExceeded(Exception):
    pass


def _get_api_key() -> Optional[str]:
    api_key = settings.comicvine_api_key
    if not api_key:
        logger.error("COMICVINE_API_KEY environment variable is not set.")
    return api_key


def _request(path: str, params: Dict[str, Any], context: str) -> Optional[Dict[str, Any]]:
    """
    Issues one throttled Comic Vine request and returns the parsed envelope.
    Returns None on any non-retryable failure; raises for retryable ones.
    """
    comicvine_rate_limiter.wait_if_needed()

    url = f"{COMICVINE_BASE_URL}/{path}"
    headers = {"User-Agent": COMICVINE_USER_AGENT}

    try:
        response = requests.get(url, params=params, headers=headers, timeout=15)

        if response.status_code == 401:
            logger.error("Comic Vine API key is invalid or unauthorized.")
            return None

        if response.status_code == 420:
            # Comic Vine's non-standard "rate limit exceeded" code.
            logger.warning(f"Comic Vine rate limit (420) for {context}.")
            raise RateLimitExceeded("420 Rate Limit Exceeded")

        if response.status_code == 429:
            logger.warning(f"Comic Vine rate limit (429) for {context}.")
            raise RateLimitExceeded("429 Too Many Requests")

        if response.status_code >= 500:
            logger.warning(
                f"Comic Vine server error ({response.status_code}) for {context} — skipping retries."
            )
            return None

        response.raise_for_status()

        payload = response.json()

        # Comic Vine reports application errors in the body with HTTP 200.
        # status_code 1 is OK; anything else is a failure.
        if payload.get("status_code") != 1:
            logger.warning(
                f"Comic Vine error for {context}: "
                f"{payload.get('error')} (status_code {payload.get('status_code')})"
            )
            return None

        return payload

    except requests.exceptions.RequestException as e:
        logger.error(f"Network/Timeout Error connecting to Comic Vine for {context}: {e}")
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
def fetch_comicvine_volume(volume_id: int) -> Optional[Dict[str, Any]]:
    """
    Fetches a single volume (one comic run) by its Comic Vine ID.
    Returns the `results` object, or None if unavailable.
    """
    if not volume_id:
        return None

    api_key = _get_api_key()
    if not api_key:
        return None

    payload = _request(
        f"volume/4050-{volume_id}/",
        {"api_key": api_key, "format": "json", "field_list": VOLUME_FIELD_LIST},
        context=f"volume {volume_id}",
    )

    if not payload:
        return None

    return payload.get("results") or None


@retry(
    stop=stop_after_attempt(5),
    wait=wait_exponential(multiplier=1, min=2, max=10),
    retry=(
        retry_if_exception_type(requests.exceptions.RequestException)
        | retry_if_exception_type(RateLimitExceeded)
    ),
    reraise=False,
)
def search_comicvine_volumes(query: str, limit: int = 10) -> List[Dict[str, Any]]:
    """
    Searches volumes by name so the admin can pick the right run and store its ID.
    Returns a (possibly empty) list of raw volume results.
    """
    if not query or not query.strip():
        return []

    api_key = _get_api_key()
    if not api_key:
        return []

    payload = _request(
        "search/",
        {
            "api_key": api_key,
            "format": "json",
            "resources": "volume",
            "query": query.strip(),
            "limit": limit,
            "field_list": SEARCH_FIELD_LIST,
        },
        context=f"search '{query}'",
    )

    if not payload:
        return []

    return payload.get("results") or []
