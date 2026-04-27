"""
tmdb.py
Handles all HTTP interactions with the TMDB (The Movie Database) API.
Strictly responsible for fetching raw external JSON data.
Uses IMDb ID as the entry point via TMDB's Find endpoint.
"""

import logging
import os
import time
from typing import Any, Dict, Optional, Tuple

from dotenv import load_dotenv
import requests
from tenacity import (
    retry,
    stop_after_attempt,
    wait_exponential,
    retry_if_exception_type,
)


from services.omdb import fetch_omdb_data

load_dotenv()

logger = logging.getLogger(__name__)

TMDB_BASE_URL = "https://api.themoviedb.org/3"


class TMDbRateLimiter:
    """Sliding window rate limiter for TMDB API (40 requests per 10 seconds)."""

    def __init__(self, max_requests: int = 40, time_window: int = 10):
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
                logger.info(
                    f"TMDB Rate Limiter: Maximum requests ({self.max_requests}) reached. "
                    f"Pausing for {sleep_time:.2f} seconds."
                )
                time.sleep(sleep_time)

        self.request_timestamps.append(time.time())


# Global instance shared across the application
tmdb_rate_limiter = TMDbRateLimiter()


class RateLimitExceeded(Exception):
    pass


def _get_api_key() -> Optional[str]:
    api_key = os.getenv("TMDB_API_KEY")
    if not api_key:
        logger.error("TMDB_API_KEY environment variable is not set.")
    return api_key


def _find_tmdb_id(imdb_tt_id: str, api_key: str) -> Optional[Tuple[int, str]]:
    """
    Resolves an IMDb tt-ID to a TMDB ID and media type ('movie' or 'tv').
    Returns (tmdb_id, media_type) or None if not found.
    """
    tmdb_rate_limiter.wait_if_needed()
    url = f"{TMDB_BASE_URL}/find/{imdb_tt_id}"
    params = {"external_source": "imdb_id", "api_key": api_key}

    response = requests.get(url, params=params, timeout=15)

    if response.status_code == 429:
        logger.warning(f"TMDB Rate Limit (429) on Find for {imdb_tt_id}.")
        raise RateLimitExceeded("429 Too Many Requests")

    if response.status_code == 404:
        logger.warning(f"TMDB Find: No results for IMDb ID {imdb_tt_id}.")
        return None

    if response.status_code >= 500:
        logger.warning(
            f"TMDB server error ({response.status_code}) on Find for {imdb_tt_id}."
        )
        return None

    response.raise_for_status()

    data = response.json()
    movie_results = data.get("movie_results", [])
    tv_results = data.get("tv_results", [])

    if movie_results:
        return movie_results[0]["id"], "movie"
    if tv_results:
        return tv_results[0]["id"], "tv"

    logger.warning(f"TMDB Find: No movie or TV results for IMDb ID {imdb_tt_id}.")
    return None


def _fetch_movie_details(tmdb_id: int, api_key: str) -> Optional[Dict[str, Any]]:
    """
    Fetches full movie details with credits appended (needed to extract director).
    """
    tmdb_rate_limiter.wait_if_needed()
    url = f"{TMDB_BASE_URL}/movie/{tmdb_id}"
    params = {"append_to_response": "credits", "api_key": api_key}

    response = requests.get(url, params=params, timeout=15)

    if response.status_code == 429:
        logger.warning(f"TMDB Rate Limit (429) on movie details for TMDB ID {tmdb_id}.")
        raise RateLimitExceeded("429 Too Many Requests")

    if response.status_code == 404:
        logger.warning(f"TMDB: Movie {tmdb_id} not found.")
        return None

    if response.status_code >= 500:
        logger.warning(
            f"TMDB server error ({response.status_code}) on movie details for {tmdb_id}."
        )
        return None

    response.raise_for_status()
    return response.json()


def _fetch_tv_details(tmdb_id: int, api_key: str) -> Optional[Dict[str, Any]]:
    """
    Fetches TV show details.
    """
    tmdb_rate_limiter.wait_if_needed()
    url = f"{TMDB_BASE_URL}/tv/{tmdb_id}"
    params = {"api_key": api_key}

    response = requests.get(url, params=params, timeout=15)

    if response.status_code == 429:
        logger.warning(f"TMDB Rate Limit (429) on TV details for TMDB ID {tmdb_id}.")
        raise RateLimitExceeded("429 Too Many Requests")

    if response.status_code == 404:
        logger.warning(f"TMDB: TV show {tmdb_id} not found.")
        return None

    if response.status_code >= 500:
        logger.warning(
            f"TMDB server error ({response.status_code}) on TV details for {tmdb_id}."
        )
        return None

    response.raise_for_status()
    return response.json()


@retry(
    stop=stop_after_attempt(5),
    wait=wait_exponential(multiplier=1, min=2, max=10),
    retry=(
        retry_if_exception_type(requests.exceptions.RequestException)
        | retry_if_exception_type(RateLimitExceeded)
    ),
    reraise=False,
)
def fetch_tmdb_data(imdb_id: int) -> Optional[Dict[str, Any]]:
    """
    Fetches title details from TMDB by IMDb integer ID.
    Makes two API calls: Find (IMDb ID → TMDB ID + media type),
    then Details (movie with credits, or TV without).
    Returns raw TMDB dict with '_media_type' key ('movie' or 'tv'), or None.
    """
    if not imdb_id:
        return None

    api_key = _get_api_key()
    if not api_key:
        return None

    imdb_tt_id = f"tt{imdb_id:07d}"

    find_result = _find_tmdb_id(imdb_tt_id, api_key)
    if not find_result:
        return None

    tmdb_id_resolved, media_type = find_result

    if media_type == "movie":
        data = _fetch_movie_details(tmdb_id_resolved, api_key)
    else:
        data = _fetch_tv_details(tmdb_id_resolved, api_key)

    if data is not None:
        data["_media_type"] = media_type

    return data


def fetch_imdb_data(imdb_id: int) -> dict:
    """
    Orchestrates TMDB + OMDb fetches for a single IMDb ID.
    Both calls run regardless of individual failure.
    Returns {"tmdb_raw": ..., "omdb_raw": ...}.
    """
    tmdb_raw = None
    omdb_raw = None

    try:
        tmdb_raw = fetch_tmdb_data(imdb_id)
    except Exception as e:
        logger.error(f"fetch_imdb_data: TMDB fetch failed for IMDb ID {imdb_id}: {e}")

    try:
        omdb_raw = fetch_omdb_data(imdb_id)
    except Exception as e:
        logger.error(f"fetch_imdb_data: OMDb fetch failed for IMDb ID {imdb_id}: {e}")

    return {"tmdb_raw": tmdb_raw, "omdb_raw": omdb_raw}
