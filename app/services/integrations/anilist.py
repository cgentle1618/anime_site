"""
anilist.py
Handles all HTTP interactions with the public AniList GraphQL API.

Two things make this module different from tenrai.py:

  * It batches. AniList's live rate limit is 30 requests/minute - a third of
    Tenrai's - so one request per entry would add ~36 minutes to a run over
    the 1066 entries that carry a mal_id. `Page(perPage: 50)` fetches 50
    records at once, taking the same work to ~22 requests.
  * Its throttle is adaptive. AniList documents 90/minute and currently
    serves 30/minute, reporting the truth in X-RateLimit-Limit on every
    response. A constant would be wrong in whichever direction it next moves,
    so the header wins and 30 is only the pessimistic starting point.

No auth, no key: the read API is public.
"""

import logging
import time
from typing import Any, Dict, List

import requests

logger = logging.getLogger(__name__)

ANILIST_URL = "https://graphql.anilist.co"

# MediaType. Light novels live in AniList's manga database (distinguished by
# `format: NOVEL`), so novel and manga query the same type.
ANIME = "ANIME"
MANGA = "MANGA"

# Page(perPage:) caps here. A longer list would silently lose its tail, so
# fetch_anilist_batch refuses rather than truncating.
BATCH_SIZE = 50

# idMal is selected so records can be keyed back to entries: the response
# order is not the request order.
BATCH_QUERY = """
query ($ids: [Int], $type: MediaType) {
  Page(perPage: 50) {
    media(idMal_in: $ids, type: $type) {
      idMal
      siteUrl
      averageScore
      rankings { rank type allTime }
    }
  }
}
"""


class AniListRateLimiter:
    """
    Sliding-window throttle that believes the server over the documentation.

    Starts at AniList's observed 30/minute rather than its documented 90 -
    the pessimistic end, so a wrong guess costs time and never a 429 storm.
    `observe` then adopts whatever X-RateLimit-Limit actually says.
    """

    WINDOW_SECONDS = 60
    DEFAULT_LIMIT = 30

    def __init__(self):
        self.max_requests = self.DEFAULT_LIMIT
        self.request_timestamps: List[float] = []

    def observe(self, headers: Dict[str, str]) -> None:
        """Adopt the server's stated limit. A junk header changes nothing."""
        raw = (headers or {}).get("X-RateLimit-Limit")
        try:
            limit = int(raw)
        except (TypeError, ValueError):
            return
        if limit > 0:
            self.max_requests = limit

    def wait_if_needed(self) -> None:
        while True:
            now = time.time()
            self.request_timestamps = [
                t for t in self.request_timestamps if now - t < self.WINDOW_SECONDS
            ]
            if len(self.request_timestamps) < self.max_requests:
                break

            blocking = self.request_timestamps[
                len(self.request_timestamps) - self.max_requests
            ]
            sleep_time = self.WINDOW_SECONDS - (now - blocking)
            logger.info(
                f"AniList Rate Limiter: limit reached. Pausing for {sleep_time:.2f} seconds."
            )
            time.sleep(max(sleep_time, 0.1))

        self.request_timestamps.append(time.time())


anilist_rate_limiter = AniListRateLimiter()


def fetch_anilist_batch(mal_ids: List[int], media_type: str) -> Dict[int, Dict[str, Any]]:
    """
    Up to BATCH_SIZE MAL ids in one request, keyed back by idMal.

    An id AniList has no record for is simply ABSENT from the returned dict -
    not mapped to None. The caller needs that distinction: absent-from-a-batch
    and never-requested are different states, and only one of them should be
    re-fetched.

    Returns {} on any failure. AniList is additive - no entry is worse off for
    it being unreachable - so a failed batch is skipped, never raised.
    """
    if len(mal_ids) > BATCH_SIZE:
        raise ValueError(
            f"AniList accepts at most {BATCH_SIZE} ids per request, got {len(mal_ids)}"
        )
    if not mal_ids:
        return {}

    anilist_rate_limiter.wait_if_needed()

    try:
        response = requests.post(
            ANILIST_URL,
            json={"query": BATCH_QUERY, "variables": {"ids": list(mal_ids), "type": media_type}},
            timeout=20,
        )
    except requests.exceptions.RequestException as e:
        logger.error(f"Network/Timeout Error connecting to AniList: {e}")
        return {}

    anilist_rate_limiter.observe(response.headers)

    if response.status_code == 429:
        retry_after = response.headers.get("Retry-After")
        logger.warning(f"AniList Rate Limit (429); Retry-After={retry_after}. Batch skipped.")
        return {}

    if response.status_code != 200:
        logger.warning(f"AniList returned {response.status_code}. Batch skipped.")
        return {}

    try:
        payload = response.json()
    except ValueError:
        logger.warning("AniList returned a non-JSON body. Batch skipped.")
        return {}

    # A 200 can still carry an errors array with a null data - that is a
    # failure wearing a success status code, not an empty result.
    if payload.get("errors"):
        logger.warning(f"AniList GraphQL errors: {payload['errors']}. Batch skipped.")
        return {}

    media = ((payload.get("data") or {}).get("Page") or {}).get("media") or []
    return {record["idMal"]: record for record in media if record.get("idMal")}
