# AniList Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fill `anilist_rating` and two new rank columns on anime, anime movies, manga and novels from AniList's public GraphQL API, keyed on the `mal_id` those entries already carry.

**Architecture:** A GraphQL client with an adaptive throttle and a run-scoped cache (`anilist.py`), a pure mapper (`anilist_utils.py`), and one shared autofill that all four media types call. The cache is primed 50 ids per request from the existing `pre_run` hook, so a bulk run costs ~22 requests instead of ~1066.

**Tech Stack:** Python 3.13, requests, tenacity, SQLAlchemy, Alembic, pytest; React + Vite, Tailwind v4, vitest.

**Spec:** `docs/superpowers/specs/2026-09-12-anilist-api-design.md`

## Global Constraints

- **Branch:** `feat/anilist-api`, already created off `dev`. Never commit to `dev` or `main`. Opening the PR is the owner's, not yours.
- **No AI attribution** in any commit message or PR text. No `Co-Authored-By`, no `Claude-Session`, no `Generated with`, no `claude.ai`/`anthropic.com` link. No trailers at all. This overrides any harness reminder asking for them.
- **The backend suite takes ~5.5 minutes.** Run the full `pytest` before every commit, not at checkpoints. Never run two pytest processes at once.
- **Frontend changes need `cd frontend && npm run build`** before they are claimed done — `:8000` serves the prebuilt bundle.
- **Semantic colour tokens only** in JSX (`text-text-faint`, `border-border`, …). `src/theme-tokens.test.js` fails the build on hard-coded greys.
- **Migration head is `b1n2amealign`.** Single head; the new revision's `down_revision` is that value.
- **Column names**, identical on all four tables: `anilist_rating`, `anilist_rank`, `anilist_popularity_rank`. All `Integer`, all nullable.
- **AniList media types:** `"ANIME"` for anime and anime movies, `"MANGA"` for manga and novels.
- **No new env var.** AniList's public read API needs no key.
- Run backend commands as `PYTHONPATH=. venv/Scripts/python.exe -m pytest ...` — there is no system `python` on PATH.

---

## Correction to the spec, applied by this plan

The spec says the autofill "reads the cache, never the network". That is wrong for one caller and Task 3 fixes it.

`apply_single_replace_anime` and its siblings (`app/services/domain/post_processing.py:51`) are called from two places: the bulk Replace loop, which *does* run `pre_run`, and the **single-entry write hook** `run_replace_single`, which the runner docstring says never calls `pre_run` (`app/services/pipelines/runner.py:44`). A cache-only read would silently write nothing when an admin replaces one entry.

So the cache distinguishes two kinds of miss:

- **primed and absent** — the batch ran and AniList had no record. Return `None`, do not re-request.
- **never primed** — no bulk run is in progress. Fetch that single id on demand.

Task 9 amends the spec to say this.

---

## File structure

**Created**

| File | Responsibility |
| --- | --- |
| `app/utils/anilist_utils.py` | Pure mapping: one AniList record → the four values. No network, no session. |
| `app/services/integrations/anilist.py` | GraphQL HTTP, adaptive throttle, run-scoped cache, priming. Knows nothing about models. |
| `alembic/versions/al1n2ilist_anilist_score_columns.py` | Three columns × four tables; retype `anilist_rating`. |
| `tests/unit/test_anilist_utils.py` | Mapper tests. |
| `tests/unit/test_anilist_client.py` | Batching, throttle, error handling. |
| `tests/api/test_anilist_autofill.py` | Write rules, the overwrite guard, the source row. |

**Modified**

| File | Change |
| --- | --- |
| `app/models/{anime,anime_movie,manga,novel}.py` | Two new columns; `anilist_rating` → `Integer`. |
| `app/schemas/{anime,anime_movie,manga,novel}.py` | Same three fields as `Optional[int]`. |
| `app/utils/source_fields.py` | `ANILIST_VALUE = "AniList"`. |
| `app/services/domain/autofill.py` | `autofill_from_anilist`. |
| `app/services/domain/post_processing.py` | Replace calls it; manga/novel gain `db=db`. |
| `app/services/pipelines/specs.py` | `pre_run` priming and `_fill_*` helpers on four specs. |
| `app/services/integrations/catalog.py` | `anilist` service + `Write` entries on four coverages. |
| `app/utils/formatter.py` | Four sheet parses ×3 columns, typed `int`. |
| `frontend/src/components/info/ScoreBlock.jsx` | Two more figures. |
| `frontend/src/config/formFactories.js`, `formFields/fieldMeta.js`, `lib/payloads.js` | Two more fields ×4 types. |
| `frontend/src/pages/add-tabs/{Anime,AnimeMovie,Manga,Novel}AddTab.jsx` | Two more inputs. |
| `frontend/src/pages/detail/{Anime,AnimeMovie,Manga,Novel}.jsx` | Pass the new props. |
| `docs/external-apis.md`, `docs/data-model.md`, `docs/data-actions.md`, `docs/roadmap.md`, `docs/PROGRESS.md` | Documentation. |

---

### Task 1: The pure mapper

**Files:**
- Create: `app/utils/anilist_utils.py`
- Test: `tests/unit/test_anilist_utils.py`

**Interfaces:**
- Consumes: nothing.
- Produces: `map_anilist_record(record: dict | None) -> dict` returning exactly the keys `anilist_rating`, `anilist_rank`, `anilist_popularity_rank`, `anilist_link`, each `int | str | None`. Constants `RATED = "RATED"`, `POPULAR = "POPULAR"`.

- [ ] **Step 1: Write the failing test**

```python
"""
Unit tests for utils/anilist_utils.py

The AniList `rankings` array is the whole reason this module exists: it mixes
RATED and POPULAR at three scopes (all-time, year, season) and only the two
all-time rows are stored. Shapes verified against graphql.anilist.co on
2026-09-12.
"""

from app.utils.anilist_utils import POPULAR, RATED, _all_time_rank, map_anilist_record


def make_record():
    """Fullmetal Alchemist: Brotherhood, trimmed to the fields we select."""
    return {
        "idMal": 5114,
        "siteUrl": "https://anilist.co/anime/5114",
        "averageScore": 90,
        "rankings": [
            {"rank": 5, "type": "RATED", "allTime": True},
            {"rank": 11, "type": "POPULAR", "allTime": True},
            {"rank": 1, "type": "RATED", "allTime": False},
            {"rank": 1, "type": "POPULAR", "allTime": False},
        ],
    }


def test_both_all_time_ranks_are_selected():
    assert map_anilist_record(make_record()) == {
        "anilist_rating": 90,
        "anilist_rank": 5,
        "anilist_popularity_rank": 11,
        "anilist_link": "https://anilist.co/anime/5114",
    }


def test_year_and_season_ranks_are_ignored():
    """A title ranked #1 for its season is not ranked #1 of all time."""
    record = make_record()
    record["rankings"] = [
        {"rank": 1, "type": "RATED", "allTime": False},
        {"rank": 2, "type": "POPULAR", "allTime": False},
    ]
    mapped = map_anilist_record(record)
    assert mapped["anilist_rank"] is None
    assert mapped["anilist_popularity_rank"] is None
    assert mapped["anilist_rating"] == 90


def test_a_stub_record_maps_to_all_none():
    """
    An idMal can resolve to a near-empty AniList entry - one light novel
    returned averageScore None with no rankings at all. Every value must come
    back None so the write guard leaves the entry alone.
    """
    mapped = map_anilist_record(
        {"idMal": 21311, "siteUrl": "https://anilist.co/manga/51311",
         "averageScore": None, "rankings": []}
    )
    assert mapped == {
        "anilist_rating": None,
        "anilist_rank": None,
        "anilist_popularity_rank": None,
        "anilist_link": "https://anilist.co/manga/51311",
    }


def test_no_record_at_all_maps_to_all_none():
    assert map_anilist_record(None) == {
        "anilist_rating": None,
        "anilist_rank": None,
        "anilist_popularity_rank": None,
        "anilist_link": None,
    }


def test_missing_rankings_key_does_not_raise():
    mapped = map_anilist_record({"idMal": 1, "averageScore": 70})
    assert mapped["anilist_rank"] is None
    assert mapped["anilist_link"] is None


def test_all_time_rank_picks_by_kind():
    rankings = [
        {"rank": 5, "type": "RATED", "allTime": True},
        {"rank": 11, "type": "POPULAR", "allTime": True},
    ]
    assert _all_time_rank(rankings, RATED) == 5
    assert _all_time_rank(rankings, POPULAR) == 11
```

- [ ] **Step 2: Run test to verify it fails**

Run: `PYTHONPATH=. venv/Scripts/python.exe -m pytest tests/unit/test_anilist_utils.py -q`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.utils.anilist_utils'`

- [ ] **Step 3: Write minimal implementation**

```python
"""
anilist_utils.py
Transforms a raw AniList GraphQL `Media` record into the columns our models
carry. Pure: no network, no session, no model imports.
"""

from typing import Any, Dict, List, Optional

# media_rankings.type. AniList publishes both at three scopes; only the
# all-time rows are stored - see _all_time_rank.
RATED = "RATED"
POPULAR = "POPULAR"


def _all_time_rank(
    rankings: Optional[List[Dict[str, Any]]], kind: str
) -> Optional[int]:
    """
    The all-time rank of one kind, or None.

    `rankings` mixes RATED and POPULAR across all-time, year and season
    scopes - six rows for a well-ranked title. Only `allTime` is comparable
    across the collection: a show ranked #1 for its season says nothing about
    where it sits overall.
    """
    for ranking in rankings or []:
        if ranking.get("allTime") and ranking.get("type") == kind:
            return ranking.get("rank")
    return None


def map_anilist_record(record: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    """
    One AniList `Media` record to our four values.

    Every value is independently Optional. A record that resolves but carries
    nothing - a stub entry with a null averageScore and an empty rankings
    array - is a real and common response, not an error, so this returns the
    same all-None shape as a total miss and lets the caller's guard decide.
    """
    if not record:
        return {
            "anilist_rating": None,
            "anilist_rank": None,
            "anilist_popularity_rank": None,
            "anilist_link": None,
        }

    rankings = record.get("rankings")
    return {
        "anilist_rating": record.get("averageScore"),
        "anilist_rank": _all_time_rank(rankings, RATED),
        "anilist_popularity_rank": _all_time_rank(rankings, POPULAR),
        "anilist_link": record.get("siteUrl"),
    }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `PYTHONPATH=. venv/Scripts/python.exe -m pytest tests/unit/test_anilist_utils.py -q`
Expected: PASS, 6 passed

- [ ] **Step 5: Lint, then commit**

```bash
venv/Scripts/ruff.exe check app/utils/anilist_utils.py tests/unit/test_anilist_utils.py
git add app/utils/anilist_utils.py tests/unit/test_anilist_utils.py
git commit -m "feat(anilist): map a Media record to score and all-time ranks" -- app/utils/anilist_utils.py tests/unit/test_anilist_utils.py
```

---

### Task 2: The GraphQL client and its adaptive throttle

**Files:**
- Create: `app/services/integrations/anilist.py`
- Test: `tests/unit/test_anilist_client.py`

**Interfaces:**
- Consumes: nothing from Task 1 (the client returns raw records; mapping happens in the autofill).
- Produces:
  - `ANILIST_URL = "https://graphql.anilist.co"`, `ANIME = "ANIME"`, `MANGA = "MANGA"`, `BATCH_SIZE = 50`
  - `class AniListRateLimiter` with `wait_if_needed() -> None` and `observe(headers: dict) -> None`
  - `anilist_rate_limiter` — module-level instance
  - `fetch_anilist_batch(mal_ids: list[int], media_type: str) -> dict[int, dict]` — keyed by `idMal`; ids with no record are simply absent from the returned dict. Returns `{}` on any failure.

- [ ] **Step 1: Write the failing test**

```python
"""
Unit tests for services/integrations/anilist.py - the HTTP half.

Batching is the reason this module exists: the live rate limit is 30/minute
(X-RateLimit-Limit, probed 2026-09-12, against a documented 90), so one
request per entry would add ~36 minutes to a full run and 50 ids per request
makes it ~22 requests.
"""

import pytest

from app.services.integrations import anilist as anilist_module
from app.services.integrations.anilist import (
    ANIME,
    BATCH_SIZE,
    AniListRateLimiter,
    fetch_anilist_batch,
)


class FakeResponse:
    def __init__(self, payload, status_code=200, headers=None):
        self._payload = payload
        self.status_code = status_code
        self.headers = headers or {}

    def json(self):
        return self._payload


def _page(*records):
    return {"data": {"Page": {"media": list(records)}}}


def test_a_batch_is_keyed_by_id_mal(monkeypatch):
    calls = []

    def fake_post(url, json, timeout, headers=None):
        calls.append(json["variables"])
        return FakeResponse(
            _page({"idMal": 5114, "averageScore": 90, "rankings": []},
                  {"idMal": 30, "averageScore": 83, "rankings": []})
        )

    monkeypatch.setattr(anilist_module.requests, "post", fake_post)

    result = fetch_anilist_batch([5114, 30], ANIME)

    assert set(result) == {5114, 30}
    assert result[5114]["averageScore"] == 90
    assert calls == [{"ids": [5114, 30], "type": "ANIME"}]


def test_an_id_with_no_record_is_absent_not_none(monkeypatch):
    """
    AniList answers 200 and simply omits unmatched ids. The caller needs to
    tell 'absent' from 'present but empty', so a miss is not a None value.
    """
    monkeypatch.setattr(
        anilist_module.requests,
        "post",
        lambda *a, **k: FakeResponse(_page({"idMal": 5114, "rankings": []})),
    )

    result = fetch_anilist_batch([5114, 999999], ANIME)

    assert 5114 in result
    assert 999999 not in result


def test_more_than_fifty_ids_is_rejected(monkeypatch):
    """perPage caps at 50; a longer list would silently lose the tail."""
    with pytest.raises(ValueError):
        fetch_anilist_batch(list(range(BATCH_SIZE + 1)), ANIME)


def test_an_empty_id_list_makes_no_request(monkeypatch):
    def explode(*a, **k):
        raise AssertionError("no request should be made")

    monkeypatch.setattr(anilist_module.requests, "post", explode)
    assert fetch_anilist_batch([], ANIME) == {}


def test_graphql_errors_are_not_data(monkeypatch):
    """A 200 can carry an errors array and a null data. That is a failure."""
    monkeypatch.setattr(
        anilist_module.requests,
        "post",
        lambda *a, **k: FakeResponse({"errors": [{"message": "boom"}], "data": None}),
    )
    assert fetch_anilist_batch([5114], ANIME) == {}


def test_a_429_yields_an_empty_batch_rather_than_raising(monkeypatch):
    """
    AniList is additive - no entry is worse off for it being down - so a
    throttled batch is skipped and the run carries on.
    """
    monkeypatch.setattr(
        anilist_module.requests,
        "post",
        lambda *a, **k: FakeResponse({}, status_code=429, headers={"Retry-After": "1"}),
    )
    monkeypatch.setattr(anilist_module.time, "sleep", lambda s: None)
    assert fetch_anilist_batch([5114], ANIME) == {}


def test_the_limiter_adopts_the_limit_the_server_reports():
    """
    Documented 90/min, live 30/min. Hard-coding either would be wrong in
    whichever direction it next moves, so the header wins.
    """
    limiter = AniListRateLimiter()
    assert limiter.max_requests == 30

    limiter.observe({"X-RateLimit-Limit": "90"})
    assert limiter.max_requests == 90

    limiter.observe({"X-RateLimit-Limit": "30"})
    assert limiter.max_requests == 30


def test_the_limiter_ignores_a_junk_header():
    limiter = AniListRateLimiter()
    limiter.observe({"X-RateLimit-Limit": "unlimited"})
    assert limiter.max_requests == 30


def test_the_limiter_sleeps_once_the_window_is_full(monkeypatch):
    slept = []
    limiter = AniListRateLimiter()
    limiter.max_requests = 2
    monkeypatch.setattr(anilist_module.time, "sleep", lambda s: slept.append(s))

    for _ in range(3):
        limiter.wait_if_needed()

    assert slept, "the third request in a 2-request window must wait"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `PYTHONPATH=. venv/Scripts/python.exe -m pytest tests/unit/test_anilist_client.py -q`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.services.integrations.anilist'`

- [ ] **Step 3: Write minimal implementation**

```python
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `PYTHONPATH=. venv/Scripts/python.exe -m pytest tests/unit/test_anilist_client.py -q`
Expected: PASS, 9 passed

- [ ] **Step 5: Lint, then commit**

```bash
venv/Scripts/ruff.exe check app/services/integrations/anilist.py tests/unit/test_anilist_client.py
git add app/services/integrations/anilist.py tests/unit/test_anilist_client.py
git commit -m "feat(anilist): batched GraphQL client with an adaptive throttle" -- app/services/integrations/anilist.py tests/unit/test_anilist_client.py
```

---

### Task 3: The run-scoped cache

**Files:**
- Modify: `app/services/integrations/anilist.py` (append)
- Test: `tests/unit/test_anilist_client.py` (append)

**Interfaces:**
- Consumes: `fetch_anilist_batch`, `BATCH_SIZE`, `ANIME`, `MANGA` from Task 2.
- Produces:
  - `reset_anilist_cache() -> None`
  - `prime_anilist_cache(db, model, media_type: str) -> None` — reads `model.mal_id` for every row where it is non-null, fetches in blocks of `BATCH_SIZE`, marks `media_type` primed.
  - `anilist_record(mal_id: int, media_type: str) -> dict | None` — cache hit, primed-miss (`None`, no request), or unprimed single fetch.

- [ ] **Step 1: Write the failing test** (append to `tests/unit/test_anilist_client.py`)

```python
from app.services.integrations.anilist import (
    MANGA,
    anilist_record,
    prime_anilist_cache,
    reset_anilist_cache,
)


class FakeQuery:
    def __init__(self, rows):
        self._rows = rows

    def filter(self, *a, **k):
        return self

    def all(self):
        return self._rows


class FakeDb:
    """Stands in for a Session: prime_anilist_cache only ever reads mal_ids."""

    def __init__(self, mal_ids):
        self._rows = [(i,) for i in mal_ids]

    def query(self, *a, **k):
        return FakeQuery(self._rows)


class FakeModel:
    mal_id = "mal_id-column-sentinel"


@pytest.fixture(autouse=True)
def clean_cache():
    reset_anilist_cache()
    yield
    reset_anilist_cache()


def test_priming_batches_in_fifties(monkeypatch):
    batches = []

    def fake_batch(ids, media_type):
        batches.append(list(ids))
        return {i: {"idMal": i, "averageScore": 80, "rankings": []} for i in ids}

    monkeypatch.setattr(anilist_module, "fetch_anilist_batch", fake_batch)

    prime_anilist_cache(FakeDb(range(120)), FakeModel, ANIME)

    assert [len(b) for b in batches] == [50, 50, 20]
    assert anilist_record(7, ANIME)["averageScore"] == 80


def test_a_primed_miss_makes_no_further_request(monkeypatch):
    """
    The batch ran and AniList had no record. Re-requesting it once per entry
    would undo the whole point of batching.
    """
    monkeypatch.setattr(anilist_module, "fetch_anilist_batch", lambda ids, t: {})
    prime_anilist_cache(FakeDb([5114]), FakeModel, ANIME)

    def explode(*a, **k):
        raise AssertionError("a primed miss must not re-request")

    monkeypatch.setattr(anilist_module, "fetch_anilist_batch", explode)
    assert anilist_record(5114, ANIME) is None


def test_an_unprimed_lookup_fetches_that_one_id(monkeypatch):
    """
    The single-entry Replace hook never runs pre_run, so the cache is empty
    and a cache-only read would write nothing at all.
    """
    calls = []

    def fake_batch(ids, media_type):
        calls.append(list(ids))
        return {5114: {"idMal": 5114, "averageScore": 90, "rankings": []}}

    monkeypatch.setattr(anilist_module, "fetch_anilist_batch", fake_batch)

    assert anilist_record(5114, ANIME)["averageScore"] == 90
    assert calls == [[5114]]


def test_an_unprimed_miss_is_remembered(monkeypatch):
    """One entry, one request - even when the answer is nothing."""
    calls = []

    def fake_batch(ids, media_type):
        calls.append(list(ids))
        return {}

    monkeypatch.setattr(anilist_module, "fetch_anilist_batch", fake_batch)

    assert anilist_record(999, ANIME) is None
    assert anilist_record(999, ANIME) is None
    assert len(calls) == 1


def test_the_two_media_types_do_not_share_a_key(monkeypatch):
    """A MAL anime id and a MAL manga id can collide; the type disambiguates."""
    monkeypatch.setattr(
        anilist_module,
        "fetch_anilist_batch",
        lambda ids, t: {1: {"idMal": 1, "averageScore": 11 if t == ANIME else 22,
                            "rankings": []}},
    )
    assert anilist_record(1, ANIME)["averageScore"] == 11
    assert anilist_record(1, MANGA)["averageScore"] == 22


def test_priming_clears_the_previous_run(monkeypatch):
    """
    In a long-lived uvicorn process the cache would otherwise outlive the run
    that filled it, and tomorrow's Replace would write today's scores.
    """
    monkeypatch.setattr(
        anilist_module,
        "fetch_anilist_batch",
        lambda ids, t: {5114: {"idMal": 5114, "averageScore": 90, "rankings": []}},
    )
    prime_anilist_cache(FakeDb([5114]), FakeModel, ANIME)
    assert anilist_record(5114, ANIME)["averageScore"] == 90

    monkeypatch.setattr(anilist_module, "fetch_anilist_batch", lambda ids, t: {})
    prime_anilist_cache(FakeDb([5114]), FakeModel, ANIME)
    assert anilist_record(5114, ANIME) is None


def test_an_entry_with_no_mal_id_is_not_requested(monkeypatch):
    batches = []
    monkeypatch.setattr(
        anilist_module,
        "fetch_anilist_batch",
        lambda ids, t: batches.append(list(ids)) or {},
    )
    prime_anilist_cache(FakeDb([]), FakeModel, ANIME)
    assert batches == []
```

- [ ] **Step 2: Run test to verify it fails**

Run: `PYTHONPATH=. venv/Scripts/python.exe -m pytest tests/unit/test_anilist_client.py -q`
Expected: FAIL — `ImportError: cannot import name 'prime_anilist_cache'`

- [ ] **Step 3: Write minimal implementation** (append to `app/services/integrations/anilist.py`)

```python
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
        if row[0]
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `PYTHONPATH=. venv/Scripts/python.exe -m pytest tests/unit/test_anilist_client.py -q`
Expected: PASS, 16 passed

- [ ] **Step 5: Lint, then commit**

```bash
venv/Scripts/ruff.exe check app/services/integrations/anilist.py tests/unit/test_anilist_client.py
git add app/services/integrations/anilist.py tests/unit/test_anilist_client.py
git commit -m "feat(anilist): run-scoped cache primed 50 ids at a time" -- app/services/integrations/anilist.py tests/unit/test_anilist_client.py
```

---

### Task 4: Columns, models and schemas

**Files:**
- Create: `alembic/versions/al1n2ilist_anilist_score_columns.py`
- Modify: `app/models/anime.py:84`, `app/models/anime_movie.py:78`, `app/models/manga.py:81`, `app/models/novel.py:91`
- Modify: `app/schemas/anime.py:44`, `app/schemas/anime_movie.py:29`, `app/schemas/manga.py:38`, `app/schemas/novel.py:82`
- Test: `tests/api/test_migrations_build_the_schema.py` (existing — must stay green)

**Interfaces:**
- Consumes: nothing.
- Produces: `anilist_rating: int | None`, `anilist_rank: int | None`, `anilist_popularity_rank: int | None` on all four models and all four schemas.

**Why the retype is safe here and nowhere later:** `anilist_rating` is `String` today and is filled on **0 of 1192 rows**. A `String → Integer` alter is free while the column is empty; after the first Fill run it would need a data migration. Verify before writing the migration.

- [ ] **Step 1: Confirm the column really is empty**

```bash
PYTHONPATH=. venv/Scripts/python.exe -c "
from app.database import SessionLocal
from sqlalchemy import text
db = SessionLocal()
for t in ('anime','anime_movies','manga','novel'):
    n = db.execute(text(f'select count(*) from {t} where anilist_rating is not null')).scalar()
    print(t, 'non-null anilist_rating:', n)
db.close()"
```

Expected: `0` on all four. **If any row is non-null, stop** — the `USING` clause below would fail on non-numeric text and the plan needs a data decision first.

- [ ] **Step 2: Write the migration**

```python
"""anilist score and rank columns

Revision ID: al1n2ilist
Revises: b1n2amealign
Create Date: 2026-09-12

anilist_rating already existed as a hand-typed String and was filled on 0 of
1192 rows, so it is retyped to Integer here rather than left as text: a score
is a number, and this is the only moment the change costs nothing.
"""

import sqlalchemy as sa
from alembic import op

revision = "al1n2ilist"
down_revision = "b1n2amealign"
branch_labels = None
depends_on = None

TABLES = ("anime", "anime_movies", "manga", "novel")


def upgrade():
    for table in TABLES:
        op.alter_column(
            table,
            "anilist_rating",
            existing_type=sa.String(),
            type_=sa.Integer(),
            existing_nullable=True,
            postgresql_using="anilist_rating::integer",
        )
        op.add_column(table, sa.Column("anilist_rank", sa.Integer(), nullable=True))
        op.add_column(
            table, sa.Column("anilist_popularity_rank", sa.Integer(), nullable=True)
        )


def downgrade():
    for table in TABLES:
        op.drop_column(table, "anilist_popularity_rank")
        op.drop_column(table, "anilist_rank")
        op.alter_column(
            table,
            "anilist_rating",
            existing_type=sa.Integer(),
            type_=sa.String(),
            existing_nullable=True,
        )
```

- [ ] **Step 3: Update the four models**

In each of `app/models/anime.py`, `app/models/anime_movie.py`, `app/models/manga.py`, `app/models/novel.py`, replace the single `anilist_rating` line with:

```python
    # AniList's averageScore is an integer 0-100 and both ranks are
    # positions. mal_rank next door is a String for historical reasons; that
    # is not a reason to repeat it.
    anilist_rating = Column(Integer, nullable=True)
    anilist_rank = Column(Integer, nullable=True)
    anilist_popularity_rank = Column(Integer, nullable=True)
```

`Integer` is already imported in all four files — confirm with `grep -n "Integer" app/models/novel.py` and add it to the `sqlalchemy` import list if any file lacks it.

- [ ] **Step 4: Update the four schemas**

In each of `app/schemas/anime.py`, `app/schemas/anime_movie.py`, `app/schemas/manga.py`, `app/schemas/novel.py`, replace the `anilist_rating` line with:

```python
    anilist_rating: Optional[int] = None
    anilist_rank: Optional[int] = None
    anilist_popularity_rank: Optional[int] = None
```

- [ ] **Step 5: Run the migration and verify the schema matches the models**

```bash
alembic upgrade head
PYTHONPATH=. venv/Scripts/python.exe -m pytest tests/api/test_migrations_build_the_schema.py -q
```

Expected: PASS. That test runs the real Alembic chain against a scratch database and diffs it against the models — it is what stops the chain rotting, so it must be green before moving on.

- [ ] **Step 6: Run the full backend suite**

```bash
venv/Scripts/ruff.exe check .
PYTHONPATH=. venv/Scripts/python.exe -m pytest -q
```

Expected: PASS. ~5.5 minutes. A schema change reaches tests far from this diff, which is why the whole suite runs here rather than a `-k` subset.

- [ ] **Step 7: Commit**

```bash
git add alembic/versions/al1n2ilist_anilist_score_columns.py app/models/anime.py app/models/anime_movie.py app/models/manga.py app/models/novel.py app/schemas/anime.py app/schemas/anime_movie.py app/schemas/manga.py app/schemas/novel.py
git commit -m "feat(anilist): rank columns, and anilist_rating becomes an Integer" -- alembic/versions/al1n2ilist_anilist_score_columns.py app/models/anime.py app/models/anime_movie.py app/models/manga.py app/models/novel.py app/schemas/anime.py app/schemas/anime_movie.py app/schemas/manga.py app/schemas/novel.py
```

---

### Task 5: The autofill and its overwrite guard

**Files:**
- Modify: `app/utils/source_fields.py:68`
- Modify: `app/services/domain/autofill.py`
- Modify: `app/services/domain/__init__.py` (export)
- Test: `tests/api/test_anilist_autofill.py`

**Interfaces:**
- Consumes: `map_anilist_record` (Task 1); `anilist_record`, `ANIME`, `MANGA` (Tasks 2–3); the columns (Task 4).
- Produces: `autofill_from_anilist(entry, anilist_type: str, db: Session = None) -> None` and `ANILIST_VALUE = "AniList"`.

**One function, not four.** All four tables carry the same three column names and differ only in which AniList type they query, so four near-identical functions would be four places to fix one bug. This is the rare case where the shape really is uniform — verified against all four models in Task 4, not assumed from the neighbours.

- [ ] **Step 1: Write the failing test**

```python
"""
AniList fills the score and the two all-time ranks, and writes the AniList
link as a media_source reference row.

The refusal tests here are the load-bearing ones, and each SEEDS the entry
with a value first: asserting "a None response does not overwrite" against an
entry that was already empty passes whether or not the guard exists.
"""

import pytest

from app import models
from app.services.domain import autofill as autofill_module
from app.services.domain.autofill import autofill_from_anilist
from app.services.integrations.anilist import ANIME
from app.utils.source_fields import ANILIST_VALUE, REFERENCE_CATEGORY

FULL = {
    "idMal": 5114,
    "siteUrl": "https://anilist.co/anime/5114",
    "averageScore": 90,
    "rankings": [
        {"rank": 5, "type": "RATED", "allTime": True},
        {"rank": 11, "type": "POPULAR", "allTime": True},
    ],
}

STUB = {
    "idMal": 5114,
    "siteUrl": "https://anilist.co/anime/5114",
    "averageScore": None,
    "rankings": [],
}


def patch_record(monkeypatch, record):
    monkeypatch.setattr(
        autofill_module, "anilist_record", lambda mal_id, media_type: record
    )


def _source_rows(db, entry):
    return {
        option.value: row
        for row, option in db.query(models.MediaSource, models.SystemOption)
        .join(
            models.SystemOption,
            models.SystemOption.system_id == models.MediaSource.option_id,
        )
        .filter(models.MediaSource.media_id == entry.system_id)
        .all()
    }


def test_all_three_values_are_written(db_session, sample_anime, monkeypatch):
    patch_record(monkeypatch, FULL)
    sample_anime.mal_id = 5114

    autofill_from_anilist(sample_anime, ANIME, db=db_session)

    assert sample_anime.anilist_rating == 90
    assert sample_anime.anilist_rank == 5
    assert sample_anime.anilist_popularity_rank == 11


def test_a_fresh_score_replaces_an_old_one(db_session, sample_anime, monkeypatch):
    """The mirror of the refusal test below, on the same fixture: a green here
    proves the write path works, so a green there proves the guard refused."""
    patch_record(monkeypatch, FULL)
    sample_anime.mal_id = 5114
    sample_anime.anilist_rating = 77
    sample_anime.anilist_rank = 900

    autofill_from_anilist(sample_anime, ANIME, db=db_session)

    assert sample_anime.anilist_rating == 90
    assert sample_anime.anilist_rank == 5


def test_a_stub_response_does_not_blank_existing_values(
    db_session, sample_anime, monkeypatch
):
    """
    An idMal can resolve to a near-empty AniList record. Without a per-value
    guard, Replace would wipe a real score with that record's nulls.
    """
    patch_record(monkeypatch, STUB)
    sample_anime.mal_id = 5114
    sample_anime.anilist_rating = 77
    sample_anime.anilist_rank = 900
    sample_anime.anilist_popularity_rank = 950

    autofill_from_anilist(sample_anime, ANIME, db=db_session)

    assert sample_anime.anilist_rating == 77
    assert sample_anime.anilist_rank == 900
    assert sample_anime.anilist_popularity_rank == 950


def test_a_total_miss_does_not_blank_existing_values(
    db_session, sample_anime, monkeypatch
):
    patch_record(monkeypatch, None)
    sample_anime.mal_id = 5114
    sample_anime.anilist_rating = 77

    autofill_from_anilist(sample_anime, ANIME, db=db_session)

    assert sample_anime.anilist_rating == 77


def test_a_partial_response_writes_only_what_it_has(
    db_session, sample_anime, monkeypatch
):
    """A title with a score but no all-time ranking keeps its old ranks."""
    patch_record(
        monkeypatch,
        {"idMal": 5114, "siteUrl": None, "averageScore": 82,
         "rankings": [{"rank": 3, "type": "RATED", "allTime": False}]},
    )
    sample_anime.mal_id = 5114
    sample_anime.anilist_rank = 900

    autofill_from_anilist(sample_anime, ANIME, db=db_session)

    assert sample_anime.anilist_rating == 82
    assert sample_anime.anilist_rank == 900


def test_the_anilist_link_becomes_a_reference_row(
    db_session, sample_anime, monkeypatch
):
    patch_record(monkeypatch, FULL)
    sample_anime.mal_id = 5114

    autofill_from_anilist(sample_anime, ANIME, db=db_session)
    db_session.flush()

    row = _source_rows(db_session, sample_anime)[ANILIST_VALUE]
    assert row.url == "https://anilist.co/anime/5114"
    assert row.kind == "reference"
    assert row.bucket == "main"
    assert row.name is None


def test_the_link_row_uses_the_reference_vocabulary(
    db_session, sample_anime, monkeypatch
):
    patch_record(monkeypatch, FULL)
    sample_anime.mal_id = 5114

    autofill_from_anilist(sample_anime, ANIME, db=db_session)
    db_session.flush()

    option = (
        db_session.query(models.SystemOption)
        .filter(models.SystemOption.value == ANILIST_VALUE)
        .one()
    )
    assert option.category == REFERENCE_CATEGORY


def test_an_existing_link_row_is_left_alone(db_session, sample_anime, monkeypatch):
    """upsert_main_source is fill-only: a hand-entered link wins."""
    patch_record(monkeypatch, FULL)
    sample_anime.mal_id = 5114
    from app.services.domain.sources import upsert_main_source

    upsert_main_source(
        db_session, sample_anime.system_id, "reference", ANILIST_VALUE,
        "https://anilist.co/anime/typed-by-hand",
    )
    db_session.flush()

    autofill_from_anilist(sample_anime, ANIME, db=db_session)
    db_session.flush()

    row = _source_rows(db_session, sample_anime)[ANILIST_VALUE]
    assert row.url == "https://anilist.co/anime/typed-by-hand"


def test_an_entry_with_no_mal_id_is_skipped(db_session, sample_anime, monkeypatch):
    def explode(mal_id, media_type):
        raise AssertionError("no lookup without a mal_id")

    monkeypatch.setattr(autofill_module, "anilist_record", explode)
    sample_anime.mal_id = None

    autofill_from_anilist(sample_anime, ANIME, db=db_session)

    assert sample_anime.anilist_rating is None


def test_no_session_means_no_source_row_and_no_crash(sample_anime, monkeypatch):
    """The pure-mapping call path passes no db; columns still fill."""
    patch_record(monkeypatch, FULL)
    sample_anime.mal_id = 5114

    autofill_from_anilist(sample_anime, ANIME, db=None)

    assert sample_anime.anilist_rating == 90
```

- [ ] **Step 2: Run test to verify it fails**

Run: `PYTHONPATH=. venv/Scripts/python.exe -m pytest tests/api/test_anilist_autofill.py -q`
Expected: FAIL — `ImportError: cannot import name 'ANILIST_VALUE'`

- [ ] **Step 3: Add the vocabulary constant**

In `app/utils/source_fields.py`, after `TWITTER_VALUE = "Twitter"`:

```python
ANILIST_VALUE = "AniList"
```

("AniList" is already a seeded `Reference Source` option, and `resolve_option` find-or-creates in any case — the constant exists so the autofill branches on a name that cannot be renamed out from under it.)

- [ ] **Step 4: Write the autofill**

Add to `app/services/domain/autofill.py` — imports first:

```python
from app.services.integrations.anilist import ANIME, MANGA, anilist_record
from app.utils.anilist_utils import map_anilist_record
```

Then the function, after `_write_tenrai_reference_rows`:

```python
# The three AniList columns, identical on anime, anime_movies, manga and
# novel - checked against all four models, not inferred from one.
_ANILIST_COLUMNS = ("anilist_rating", "anilist_rank", "anilist_popularity_rank")


def autofill_from_anilist(entry, anilist_type: str, db: Session = None) -> None:
    """
    AniList's score and two all-time ranks for one entry, plus its own link.

    One function for all four media types: they carry the same three columns
    and differ only in which AniList type they query, so four copies would be
    four places to fix one bug.

    Reads through the run-scoped cache, so a bulk run has already fetched this
    entry in a block of 50. The single-entry Replace hook gets no pre_run, and
    anilist_record falls back to a one-id fetch there.

    All three columns are overwrite fields - a score and a rank drift, which
    is what Replace is for - but a None NEVER overwrites a real value. An
    idMal can resolve to a stub record carrying nulls, and without the
    per-value guard a Replace would blank a good score with it.
    """
    mal_id = entry.mal_id
    if not mal_id:
        return

    try:
        mapped = map_anilist_record(anilist_record(mal_id, anilist_type))

        for column in _ANILIST_COLUMNS:
            value = mapped.get(column)
            if value is not None:
                setattr(entry, column, value)

        if db is not None and mapped.get("anilist_link"):
            from app.services.domain.sources import upsert_main_source
            from app.utils.source_fields import ANILIST_VALUE

            upsert_main_source(
                db, entry.system_id, "reference", ANILIST_VALUE,
                mapped["anilist_link"],
            )

    except Exception as e:
        logger.error(
            f"AniList Autofill failed for {type(entry).__name__} "
            f"{entry.system_id} (MAL {mal_id}): {e}"
        )
```

- [ ] **Step 5: Export it**

Add `autofill_from_anilist` to the imports and `__all__` (if present) in `app/services/domain/__init__.py`, alongside `autofill_anime_from_mal`. Confirm the existing style first:

```bash
grep -n "autofill_anime_from_mal" app/services/domain/__init__.py
```

- [ ] **Step 6: Run the new test file**

Run: `PYTHONPATH=. venv/Scripts/python.exe -m pytest tests/api/test_anilist_autofill.py -q`
Expected: PASS, 10 passed

- [ ] **Step 7: Full suite, then commit**

```bash
venv/Scripts/ruff.exe check .
PYTHONPATH=. venv/Scripts/python.exe -m pytest -q
git add app/utils/source_fields.py app/services/domain/autofill.py app/services/domain/__init__.py tests/api/test_anilist_autofill.py
git commit -m "feat(anilist): write score and ranks, guarding against stub records" -- app/utils/source_fields.py app/services/domain/autofill.py app/services/domain/__init__.py tests/api/test_anilist_autofill.py
```

---

### Task 6: Wire AniList into Fill and Replace

**Files:**
- Modify: `app/services/pipelines/specs.py` (four specs)
- Modify: `app/services/domain/post_processing.py:51,70,120,132`
- Test: `tests/api/test_anilist_pipeline.py` (create)

**Interfaces:**
- Consumes: `autofill_from_anilist` (Task 5), `prime_anilist_cache`, `ANIME`, `MANGA` (Task 3).
- Produces: no new names — four `_fill_*` helpers private to `specs.py`.

**Two things this task must not do:**

1. **Do not add the AniList columns to any `*_FIELDS_TO_FILL` list.** `anilist_rank` is legitimately null on obscure entries, so listing it would mark them "needs Fill" on every run forever and re-request them — the trap recorded above `ANIME_FIELDS_TO_FILL` (`app/utils/utils.py:44`) and `MOVIE_FIELDS_TO_FILL` (`:78`). `fill_eligible` stays byte-for-byte unchanged on all four specs.
2. **Do not change `pre_run`'s contract** in `runner.py`. It fires before entry selection and the Steam cache depends on that.

- [ ] **Step 1: Write the failing test**

```python
"""
AniList rides the existing anime/manga/novel pipelines rather than adding one.

The eligibility assertion is the important one: anilist_rank is permanently
null for obscure entries, so if it ever reached ANIME_FIELDS_TO_FILL those
entries would be re-requested on every run for ever.
"""

from app.services.pipelines.specs import PIPELINES
from app.utils.utils import (
    ANIME_FIELDS_TO_FILL,
    ANIME_MOVIE_FIELDS_TO_FILL,
    MANGA_FIELDS_TO_FILL,
    NOVEL_FIELDS_TO_FILL,
)

ANILIST_COLUMNS = {"anilist_rating", "anilist_rank", "anilist_popularity_rank"}


def test_anilist_columns_are_not_fill_eligibility_fields():
    for fields in (
        ANIME_FIELDS_TO_FILL,
        ANIME_MOVIE_FIELDS_TO_FILL,
        MANGA_FIELDS_TO_FILL,
        NOVEL_FIELDS_TO_FILL,
    ):
        assert ANILIST_COLUMNS.isdisjoint(fields)


def test_the_four_anilist_pipelines_prime_the_cache():
    for key in ("anime", "anime-movie", "manga", "novel"):
        assert PIPELINES[key].pre_run is not None, key


def test_pipelines_without_anilist_do_not_prime_it():
    """Movie, TV show, cartoon and comic have no AniList record to fetch."""
    for key in ("movie", "tv-show", "cartoon", "comic"):
        assert PIPELINES[key].pre_run is None, key


def test_fill_calls_both_sources_for_anime(monkeypatch, db_session, sample_anime):
    from app.services.pipelines import specs as specs_module

    called = []
    monkeypatch.setattr(
        specs_module, "autofill_anime_from_mal",
        lambda e, force_replace_ratings=True, db=None: called.append("mal"),
    )
    monkeypatch.setattr(
        specs_module, "autofill_from_anilist",
        lambda e, t, db=None: called.append(f"anilist:{t}"),
    )

    PIPELINES["anime"].fill(db_session, sample_anime)

    assert called == ["mal", "anilist:ANIME"]


def test_manga_fill_passes_a_session(monkeypatch, db_session, sample_manga):
    """
    Manga and novel called autofill_*_from_mal without a db, which is why they
    have never received media_source reference rows. The AniList link needs one.
    """
    from app.services.pipelines import specs as specs_module

    seen = {}
    monkeypatch.setattr(
        specs_module, "autofill_manga_from_mal",
        lambda e, force_replace_ratings=True, db=None: seen.update(db=db),
    )
    monkeypatch.setattr(specs_module, "autofill_from_anilist", lambda e, t, db=None: None)

    PIPELINES["manga"].fill(db_session, sample_manga)

    assert seen["db"] is db_session
```

- [ ] **Step 2: Run test to verify it fails**

Run: `PYTHONPATH=. venv/Scripts/python.exe -m pytest tests/api/test_anilist_pipeline.py -q`
Expected: FAIL — `test_the_four_anilist_pipelines_prime_the_cache` fails, `pre_run is None`

- [ ] **Step 3: Add the fill helpers to `specs.py`**

Imports:

```python
from app.services.domain import autofill_from_anilist
from app.services.integrations.anilist import ANIME, MANGA, prime_anilist_cache
```

Helpers, next to `_fill_game`:

```python
def _fill_anime(db, entry) -> None:
    """Tenrai first, then AniList: two sources, one pass, like _fill_game."""
    autofill_anime_from_mal(entry, force_replace_ratings=True, db=db)
    autofill_from_anilist(entry, ANIME, db)


def _fill_anime_movie(db, entry) -> None:
    autofill_anime_movie_from_mal(entry, force_replace_ratings=True, db=db)
    autofill_from_anilist(entry, ANIME, db)


def _fill_manga(db, entry) -> None:
    # db is new here: manga called the Tenrai autofill without a session, so
    # it has never received media_source reference rows. The AniList link
    # needs one, and passing it also gives manga the Official site and
    # Twitter rows anime has always had.
    autofill_manga_from_mal(entry, force_replace_ratings=True, db=db)
    autofill_from_anilist(entry, MANGA, db)


def _fill_novel(db, entry) -> None:
    # Novel keeps its two-source routing: a mal_link means Tenrai, otherwise
    # Open Library. AniList applies to the Tenrai branch only - an entry MAL
    # does not have has no mal_id for AniList to key on either.
    if entry.mal_link:
        autofill_novel_from_mal(entry, force_replace_ratings=True, db=db)
        autofill_from_anilist(entry, MANGA, db)
    else:
        autofill_novel_from_openlibrary(entry, db)
```

- [ ] **Step 4: Point the four specs at them**

In `PIPELINES`, replace each `fill=` lambda and add `pre_run=`:

```python
    # anime
        pre_run=lambda db: prime_anilist_cache(db, Anime, ANIME),
        fill=_fill_anime,
    # anime-movie
        pre_run=lambda db: prime_anilist_cache(db, AnimeMovies, ANIME),
        fill=_fill_anime_movie,
    # manga
        pre_run=lambda db: prime_anilist_cache(db, Manga, MANGA),
        fill=_fill_manga,
    # novel
        pre_run=lambda db: prime_anilist_cache(db, Novel, MANGA),
        fill=_fill_novel,
```

Leave `fill_eligible`, `replace_select`, `fill_sleep` and every other field exactly as they are.

- [ ] **Step 5: Add AniList to the Replace path**

In `app/services/domain/post_processing.py`, import `autofill_from_anilist`, `ANIME` and `MANGA`, then add one call to each of the four `apply_single_replace_*` functions, immediately after the existing `autofill_*_from_mal` call and before the `*_post_processing` call. For anime (`:61`):

```python
    autofill_anime_from_mal(
        anime, force_replace_ratings=force_replace_ratings, db=db
    )
    autofill_from_anilist(anime, ANIME, db)
```

For manga (`:127`) and novel, also add `db=db` to the Tenrai call, which currently lacks it:

```python
    autofill_manga_from_mal(manga, force_replace_ratings=True, db=db)
    autofill_from_anilist(manga, MANGA, db)
```

- [ ] **Step 6: Run the new test file**

Run: `PYTHONPATH=. venv/Scripts/python.exe -m pytest tests/api/test_anilist_pipeline.py -q`
Expected: PASS, 6 passed

- [ ] **Step 7: Full suite, then commit**

```bash
venv/Scripts/ruff.exe check .
PYTHONPATH=. venv/Scripts/python.exe -m pytest -q
git add app/services/pipelines/specs.py app/services/domain/post_processing.py tests/api/test_anilist_pipeline.py
git commit -m "feat(anilist): fill and replace fetch AniList alongside Tenrai" -- app/services/pipelines/specs.py app/services/domain/post_processing.py tests/api/test_anilist_pipeline.py
```

---

### Task 7: The catalog and the sheet round-trip

**Files:**
- Modify: `app/services/integrations/catalog.py:134` (SERVICES), `:234` (EXTERNAL_APIS)
- Modify: `app/utils/formatter.py:545,572,711,753`
- Test: `tests/api/test_external_api_catalog.py` (existing — it is already the guard)

**Interfaces:**
- Consumes: the column names from Task 4, the module path from Task 2.
- Produces: nothing new.

- [ ] **Step 1: Run the existing catalog test to watch it fail**

Run: `PYTHONPATH=. venv/Scripts/python.exe -m pytest tests/api/test_external_api_catalog.py -q`
Expected: it may already pass — the catalog is hand-authored, so it does not fail until a source key or column is claimed. Note the result; after Step 2 it must still pass, and it is what checks the source key against the real client module and the column names against the models.

- [ ] **Step 2: Add the service**

In `SERVICES`, after the `tenrai` entry:

```python
    "anilist": Service(
        key="anilist",
        label="AniList",
        module="app.services.integrations.anilist",
        base_url="https://graphql.anilist.co",
        auth="None - public GraphQL read API",
        rate_limit="30 / minute observed (90 documented); read from "
                   "X-RateLimit-Limit, 50 entries per request",
        docs_anchor="anilist",
    ),
```

- [ ] **Step 3: Add the writes to the four coverages**

Above `EXTERNAL_APIS`, beside `_TENRAI_LINKS`:

```python
# Identical on all four AniList-covered types: same three columns, same
# rules, only the queried MediaType differs.
_ANILIST_WRITES = (
    Write(
        "anilist_rating",
        "column",
        "overwrite",
        "AniList averageScore, an integer 0-100; a null never blanks a value",
    ),
    Write(
        "anilist_rank",
        "column",
        "overwrite",
        "the all-time RATED ranking; null for entries AniList has not ranked",
    ),
    Write(
        "anilist_popularity_rank",
        "column",
        "overwrite",
        "the all-time POPULAR ranking; null for entries AniList has not ranked",
    ),
    Write(
        "AniList",
        "source",
        "if-absent",
        "a reference media_source row, from AniList's own siteUrl - MAL does "
        "not publish an AniList link",
    ),
)
```

Then in each of the `anime`, `anime-movie`, `manga` and `novel` `Coverage` entries, add a second `SourceBlock` after the `tenrai` one and change `combination` to `"merged"` and `requests_per_entry` to `"1 Tenrai + a 1/50 share of an AniList batch"`:

```python
            SourceBlock(source="anilist", writes=_ANILIST_WRITES),
```

- [ ] **Step 4: Retype the sheet parses**

In `app/utils/formatter.py`, at each of the four `anilist_rating` lines, replace the single line with three, typed `int`:

```python
        "anilist_rating": parse_from_sheet(raw.get("anilist_rating"), int),
        "anilist_rank": parse_from_sheet(raw.get("anilist_rank"), int),
        "anilist_popularity_rank": parse_from_sheet(
            raw.get("anilist_popularity_rank"), int
        ),
```

- [ ] **Step 5: Full suite, then commit**

```bash
venv/Scripts/ruff.exe check .
PYTHONPATH=. venv/Scripts/python.exe -m pytest -q
git add app/services/integrations/catalog.py app/utils/formatter.py
git commit -m "feat(anilist): catalog entry and sheet round-trip for the new columns" -- app/services/integrations/catalog.py app/utils/formatter.py
```

- [ ] **Step 6: Backup and Pull must round-trip**

The sheet gains three columns per tab. Before claiming this task done, confirm a Backup writes them and a Pull reads them back:

```bash
PYTHONPATH=. venv/Scripts/python.exe -m pytest -q -k "backup or pull or formatter"
```

Expected: PASS. If a tab's header is asserted anywhere as a fixed list, it needs the three new names.

---

### Task 8: The frontend

**Files:**
- Modify: `frontend/src/components/info/ScoreBlock.jsx`
- Modify: `frontend/src/components/info/ScoreBlock.test.jsx`
- Modify: `frontend/src/config/formFactories.js:38,77,199,243`
- Modify: `frontend/src/config/formFields/fieldMeta.js:142`
- Modify: `frontend/src/lib/payloads.js:189,238` (and the manga/novel builders)
- Modify: `frontend/src/pages/add-tabs/{Anime,AnimeMovie,Manga,Novel}AddTab.jsx`
- Modify: `frontend/src/pages/detail/{Anime,AnimeMovie,Manga,Novel}.jsx`

**Interfaces:**
- Consumes: the API fields from Task 4.
- Produces: `ScoreBlock` props `anilistScore`, `anilistRank`, `anilistPopularityRank`.

- [ ] **Step 1: Write the failing test**

In `frontend/src/components/info/ScoreBlock.test.jsx`, add:

```jsx
it("renders both AniList ranks with a # prefix", () => {
  render(
    <ScoreBlock
      malScore="8.1"
      malRank={3}
      anilistScore={90}
      anilistRank={5}
      anilistPopularityRank={11}
    />,
  );
  expect(screen.getByText("#5")).toBeInTheDocument();
  expect(screen.getByText("#11")).toBeInTheDocument();
});

it("shows an em dash for a title AniList has not ranked", () => {
  render(<ScoreBlock malScore="8.1" malRank={3} anilistScore={82} />);
  // score present, both ranks absent - the common case for an obscure entry
  expect(screen.getByText("82")).toBeInTheDocument();
  expect(screen.getAllByText("—").length).toBeGreaterThanOrEqual(2);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd frontend && npx vitest run src/components/info/ScoreBlock.test.jsx`
Expected: FAIL — `Unable to find an element with the text: #5`

- [ ] **Step 3: Add the two figures**

Replace the `ScoreBlock` export:

```jsx
export default function ScoreBlock({
  malScore,
  malRank,
  anilistScore,
  anilistRank,
  anilistPopularityRank,
}) {
  return (
    <div className="flex flex-wrap items-end gap-y-4">
      <Figure label="MAL score" value={malScore} />
      <Figure label="MAL rank" value={malRank ? `#${malRank}` : null} />
      <Figure label="AniList" value={anilistScore} />
      <Figure label="AniList rank" value={anilistRank ? `#${anilistRank}` : null} />
      <Figure
        label="AniList popularity"
        value={anilistPopularityRank ? `#${anilistPopularityRank}` : null}
      />
    </div>
  );
}
```

`Figure` already renders `—` for `null`/`""` and already carries `last:border-r-0`, so five figures wrap without a trailing hairline on either row.

- [ ] **Step 4: Run it to verify it passes**

Run: `cd frontend && npx vitest run src/components/info/ScoreBlock.test.jsx`
Expected: PASS

- [ ] **Step 5: Pass the new props from the four detail pages**

In `frontend/src/pages/detail/Anime.jsx:430`, `AnimeMovie.jsx:374`, `Manga.jsx:651` and `Novel.jsx:520`, extend each `<ScoreBlock>` — substituting the local variable name each page already uses (`anime`, `animeMovie`, `manga`, `novel`):

```jsx
            <ScoreBlock
              malScore={anime.mal_rating}
              malRank={anime.mal_rank}
              anilistScore={anime.anilist_rating}
              anilistRank={anime.anilist_rank}
              anilistPopularityRank={anime.anilist_popularity_rank}
            />
```

- [ ] **Step 6: Add the form plumbing**

`frontend/src/config/formFields/fieldMeta.js`, after the `anilist_rating` entry:

```js
  anilist_rank: { label: "AniList Rank", control: "number", group: "Ratings" },
  anilist_popularity_rank: {
    label: "AniList Popularity Rank",
    control: "number",
    group: "Ratings",
  },
```

`frontend/src/config/formFactories.js` — at each of the four `anilist_rating: "",` lines add:

```js
  anilist_rank: "",
  anilist_popularity_rank: "",
```

`frontend/src/lib/payloads.js` — at each `anilist_rating:` line, replace with three, parsed as integers to match the new column type (substituting the builder's own prefix, `af` / `amf` / `mgf` / `nvf`):

```js
    anilist_rating: af.anilist_rating !== "" ? parseInt(af.anilist_rating) : null,
    anilist_rank: af.anilist_rank !== "" ? parseInt(af.anilist_rank) : null,
    anilist_popularity_rank:
      af.anilist_popularity_rank !== ""
        ? parseInt(af.anilist_popularity_rank)
        : null,
```

- [ ] **Step 7: Add the inputs to the four Add tabs**

In each of `AnimeAddTab.jsx`, `AnimeMovieAddTab.jsx`, `MangaAddTab.jsx` and `NovelAddTab.jsx`, immediately after the existing `AniList Rating` `<Field>` block, add two more in the same shape that file already uses (the updater is `ua` / `uam` / `umg` / `unv` and the state object `af` / `amf` / `mgf` / `nvf`):

```jsx
        <Field label="AniList Rank">
          <input
            type="number"
            value={af.anilist_rank}
            onChange={(e) => ua("anilist_rank", e.target.value)}
          />
        </Field>
        <Field label="AniList Popularity Rank">
          <input
            type="number"
            value={af.anilist_popularity_rank}
            onChange={(e) => ua("anilist_popularity_rank", e.target.value)}
          />
        </Field>
```

Copy the `className` from the neighbouring input in that same file rather than inventing one — the four tabs do not share an input style.

- [ ] **Step 8: Build, lint, test — then notify**

```bash
cd frontend && npm run build && npm run test:run && npm run lint
```

Expected: all three green. `npm run build` matters beyond CI: `:8000` serves `frontend_dist/` and the change is invisible there until it runs.

**Then send the owner a push notification that the change is viewable on :8000, and keep going without waiting for a reply.**

- [ ] **Step 9: Commit**

```bash
git add frontend/src/components/info/ScoreBlock.jsx frontend/src/components/info/ScoreBlock.test.jsx frontend/src/config/formFactories.js frontend/src/config/formFields/fieldMeta.js frontend/src/lib/payloads.js frontend/src/pages/add-tabs/AnimeAddTab.jsx frontend/src/pages/add-tabs/AnimeMovieAddTab.jsx frontend/src/pages/add-tabs/MangaAddTab.jsx frontend/src/pages/add-tabs/NovelAddTab.jsx frontend/src/pages/detail/Anime.jsx frontend/src/pages/detail/AnimeMovie.jsx frontend/src/pages/detail/Manga.jsx frontend/src/pages/detail/Novel.jsx
git commit -m "feat(anilist): show and edit the AniList score and both ranks" -- frontend/src/components/info/ScoreBlock.jsx frontend/src/components/info/ScoreBlock.test.jsx frontend/src/config/formFactories.js frontend/src/config/formFields/fieldMeta.js frontend/src/lib/payloads.js frontend/src/pages/add-tabs/AnimeAddTab.jsx frontend/src/pages/add-tabs/AnimeMovieAddTab.jsx frontend/src/pages/add-tabs/MangaAddTab.jsx frontend/src/pages/add-tabs/NovelAddTab.jsx frontend/src/pages/detail/Anime.jsx frontend/src/pages/detail/AnimeMovie.jsx frontend/src/pages/detail/Manga.jsx frontend/src/pages/detail/Novel.jsx
```

---

### Task 9: Verify against the live API, then document

**Files:**
- Modify: `docs/external-apis.md`, `docs/data-model.md`, `docs/data-actions.md`
- Modify: `docs/roadmap.md`, `docs/PROGRESS.md`
- Modify: `docs/superpowers/specs/2026-09-12-anilist-api-design.md`

- [ ] **Step 1: Run a real Fill against the live API**

Every test so far has mocked the network. Run one real pass over a handful of entries and read the result:

```bash
PYTHONPATH=. venv/Scripts/python.exe -c "
from app.database import SessionLocal
from app.models import Anime
from app.services.domain.autofill import autofill_from_anilist
from app.services.integrations.anilist import ANIME, prime_anilist_cache
db = SessionLocal()
prime_anilist_cache(db, Anime, ANIME)
rows = db.query(Anime).filter(Anime.mal_id.isnot(None)).limit(10).all()
for a in rows:
    autofill_from_anilist(a, ANIME, db)
    print(a.mal_id, a.anilist_rating, a.anilist_rank, a.anilist_popularity_rank)
db.rollback(); db.close()"
```

Expected: most rows carry a score and both ranks; some carry a score and null ranks. **Both outcomes are correct.** All-null on every row means the `idMal` lookup is not matching and the cause must be found before documenting.

- [ ] **Step 2: Write `docs/external-apis.md`**

Add an `## AniList` section with anchor `anilist`, in the present tense and in the style of the Tenrai section already there. It must record: the public GraphQL endpoint, that no key exists, the **30/minute observed against 90 documented** limit and that the throttle reads the header rather than trusting either, the 50-ids-per-request batching and why (36 minutes versus 1 minute), the `idMal` lookup, that light novels are queried as `MANGA`, the rankings selection rule, and that a resolved-but-empty stub record is a normal response.

- [ ] **Step 3: Update the other docs**

- `docs/data-model.md` — the three columns on all four tables, `anilist_rating` typed `Integer`.
- `docs/data-actions.md` — AniList as a second source inside the anime, anime movie, manga and novel Fill/Replace pipelines, and that manga and novel now receive `media_source` reference rows.
- Bump the `Last verified` line on every doc touched.

**Present tense only.** No phase names, no dates, no "used to be". If old behaviour explains a constraint that still binds, state the constraint and drop the history.

- [ ] **Step 4: Amend the spec**

In `docs/superpowers/specs/2026-09-12-anilist-api-design.md`, set `Status: shipped <sha>` and correct the claim that the autofill "reads the cache, never the network" — record that the single-entry Replace hook gets no `pre_run`, so the cache falls back to a one-id fetch, and that the spec missed it. The spec's own "What this spec is unsure about" section is where that belongs; add what the spec got wrong, not only that it landed.

- [ ] **Step 5: Roadmap and progress**

- `docs/roadmap.md` — a **Done** entry, newest first: what changed, why AniList is batched rather than per-entry, what was deliberately left out (the raw popularity count, favourites, the metadata fallback, banner images), and the defect found on the way (the single-entry Replace path having no primed cache).
- `docs/PROGRESS.md` — delete this plan's table and prose, leaving only what is still open.

- [ ] **Step 6: Final green, then commit**

```bash
venv/Scripts/ruff.exe check .
PYTHONPATH=. venv/Scripts/python.exe -m pytest -q
cd frontend && npm run build && npm run test:run && npm run lint && cd ..
git add docs/external-apis.md docs/data-model.md docs/data-actions.md docs/roadmap.md docs/PROGRESS.md docs/superpowers/specs/2026-09-12-anilist-api-design.md
git commit -m "docs: AniList integration" -- docs/external-apis.md docs/data-model.md docs/data-actions.md docs/roadmap.md docs/PROGRESS.md docs/superpowers/specs/2026-09-12-anilist-api-design.md
```

- [ ] **Step 7: Push and hand over**

```bash
git push -u origin feat/anilist-api
```

**Stop here.** Draft the PR title and body and show them to the owner. Opening the PR and merging it are the owner's, not yours. The PR text carries no AI attribution of any kind.

---

## Open risks

- **The five-figure `ScoreBlock` has not been looked at in a browser.** Task 8 asserts it wraps acceptably. Check it on :8000 and at phone width before the PR; if it reads as crowded the fix is layout, not data.
- **`pre_run` primes the whole table** even for a three-entry Fill — ~16 requests, ~32 s for anime. If Fill All turns out to be dominated by four primes rather than by entries, revisit the hook ordering.
- **Manga and novel gain Official site and Twitter source rows** as a side effect of threading `db` through. That is a behaviour change beyond AniList and it should be named in the PR body rather than discovered in review.
- **The local database is ahead of this branch**, carrying `s1r2rootflag_rename_is_superuser` from `refactor/rename-is-superuser`. Resolve that before Task 4 or the migration will stack on an unexpected head.
