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


# ---------------------------------------------------------------------------
# Run-scoped cache
# ---------------------------------------------------------------------------
#
# One Fill or Replace run fetches every entry's scores in blocks of 50 and
# reads them back per entry. prime_anilist_cache() is how a pipeline run says
# "start fresh"; it is wired as `pre_run` on the four specs, which fires once
# before any entry is queued.
#
# _cache holds (mal_id, media_type) -> record-or-None. _primed holds the media
# types a bulk prime has already covered, and it is what separates the two
# kinds of miss:
#
#   * primed and absent  - the batch ran, AniList has no record. Return None
#     and do NOT re-request; re-fetching per entry would undo the batching.
#   * never primed       - no bulk run is in progress. This is the single-entry
#     Replace hook, which runner.py deliberately does not give a pre_run, so
#     fetch that one id on demand or it would silently write nothing.

_cache: Dict[tuple, Any] = {}
_primed: set = set()


def reset_anilist_cache() -> None:
    """Drop everything, so a run never reads a previous run's scores."""
    _cache.clear()
    _primed.clear()


def prime_anilist_cache(db, model, media_type: str) -> None:
    """
    Fetch every mal_id on `model` in blocks of BATCH_SIZE.

    Fires from `pre_run`, which runs before entry selection - so a Fill
    touching three anime still primes all of them. That costs ~16 requests
    (~32 s) for anime and is accepted: making it proportional would mean
    moving pre_run after selection in the shared runner, changing a contract
    the Steam cache already depends on.
    """
    reset_anilist_cache()

    mal_ids = [
        row[0]
        for row in db.query(model.mal_id).filter(model.mal_id.isnot(None)).all()
        if row[0] is not None
    ]

    for start in range(0, len(mal_ids), BATCH_SIZE):
        block = mal_ids[start : start + BATCH_SIZE]
        found = fetch_anilist_batch(block, media_type)
        for mal_id in block:
            _cache[(int(mal_id), media_type)] = found.get(int(mal_id))

    _primed.add(media_type)


def anilist_record(mal_id: int, media_type: str) -> Any:
    """The cached record for one entry, fetching on demand if unprimed."""
    if not mal_id:
        return None

    key = (int(mal_id), media_type)
    if key in _cache:
        return _cache[key]

    if media_type in _primed:
        # The bulk prime covered this id and AniList had nothing.
        return None

    found = fetch_anilist_batch([int(mal_id)], media_type)
    record = found.get(int(mal_id))
    _cache[key] = record
    return record
