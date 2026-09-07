"""
openlibrary.py
Handles all HTTP interactions with the Open Library API.
Strictly responsible for fetching raw external JSON data.

An Open Library *work* is one book. A novel entry may span several books
(Mistborn is one entry and three novels), so the stored work id names the
entry's anchor book — see the design spec, Decision A.

No API key: Open Library is open. The User-Agent is not optional, though —
generic client agents get throttled, the same reason Comic Vine and Tenrai
set one.
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

logger = logging.getLogger(__name__)

OPENLIBRARY_BASE_URL = "https://openlibrary.org"
OPENLIBRARY_USER_AGENT = "CG1618-Media-Tracker/1.0"

# The editions list is the only place a first-publication year can be found;
# work.first_publish_date is unpopulated in practice (see the spec's probe).
EDITIONS_LIMIT = 1000
# A book has one or two authors. The cap stops a pathological record from
# costing dozens of requests.
MAX_AUTHOR_CALLS = 3


class OpenLibraryRateLimiter:
    """
    Sliding window rate limiter for Open Library (100 requests per minute).

    Open Library publishes no hard quota; this is politeness, not a ceiling
    they enforce. In-memory and per-process, like every other limiter here:
    it resets on restart and is not shared between instances.
    """

    def __init__(self, max_requests: int = 100, time_window: int = 60):
        self.max_requests = max_requests
        self.time_window = time_window
        self.request_timestamps = []

    def _prune(self, now: float) -> None:
        self.request_timestamps = [
            t for t in self.request_timestamps if now - t < self.time_window
        ]

    def has_capacity(self) -> bool:
        self._prune(time.time())
        return len(self.request_timestamps) < self.max_requests

    def wait_if_needed(self):
        now = time.time()
        self._prune(now)

        if len(self.request_timestamps) >= self.max_requests:
            sleep_time = self.time_window - (now - self.request_timestamps[0])
            if sleep_time > 0:
                logger.warning(
                    f"Open Library Rate Limiter: limit ({self.max_requests}) reached. "
                    f"Pausing for {sleep_time:.2f} seconds."
                )
                time.sleep(sleep_time)

        self.request_timestamps.append(time.time())


openlibrary_rate_limiter = OpenLibraryRateLimiter()


class RateLimitExceeded(Exception):
    pass


def _request(path: str, context: str) -> Optional[Any]:
    """
    Issues one throttled Open Library request and returns the parsed JSON.
    Returns None on any non-retryable failure; raises for retryable ones.
    """
    openlibrary_rate_limiter.wait_if_needed()

    url = f"{OPENLIBRARY_BASE_URL}{path}"
    headers = {"User-Agent": OPENLIBRARY_USER_AGENT}

    try:
        response = requests.get(url, headers=headers, timeout=15)

        if response.status_code == 429:
            logger.warning(f"Open Library rate limit (429) for {context}.")
            raise RateLimitExceeded("429 Too Many Requests")

        if response.status_code == 404:
            logger.warning(f"Open Library has no record for {context}.")
            return None

        if response.status_code >= 500:
            logger.warning(
                f"Open Library server error ({response.status_code}) for {context} "
                "— skipping retries."
            )
            return None

        response.raise_for_status()
        return response.json()

    except requests.exceptions.RequestException as e:
        logger.error(
            f"Network/Timeout Error connecting to Open Library for {context}: {e}"
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
def fetch_openlibrary_work(
    work_id: str, *, want_editions: bool = True, want_authors: bool = True
) -> Optional[Dict[str, Any]]:
    """
    Fetches one work and, only when asked for, its editions and its authors.

    The flags exist because the caller's writes are fill-only: an entry that
    already has a release_date can never use the editions response, and one
    that already has an author credit can never use the author responses.
    Skipping them drops the steady-state cost to a single request.
    """
    if not work_id:
        return None

    work = _request(f"/works/{work_id}.json", context=f"work {work_id}")
    if not work:
        return None

    editions: List[Dict[str, Any]] = []
    if want_editions:
        payload = _request(
            f"/works/{work_id}/editions.json?limit={EDITIONS_LIMIT}",
            context=f"editions of {work_id}",
        )
        editions = (payload or {}).get("entries") or []

    authors: List[Dict[str, Any]] = []
    if want_authors:
        for entry in (work.get("authors") or [])[:MAX_AUTHOR_CALLS]:
            key = (entry.get("author") or {}).get("key")
            if not key:
                continue
            author = _request(f"{key}.json", context=f"author {key}")
            if author:
                authors.append(author)

    return {"work": work, "editions": editions, "authors": authors}
