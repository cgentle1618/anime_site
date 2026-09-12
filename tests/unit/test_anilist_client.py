"""
Unit tests for services/integrations/anilist.py - the HTTP half.

Batching is the reason this module exists: the live rate limit is 30/minute
(X-RateLimit-Limit, probed 2026-09-12, against a documented 90), so one
request per entry would add ~36 minutes to a full run and 50 ids per request
makes it ~22 requests.
"""

import time

import pytest

from app.services.integrations import anilist as anilist_module
from app.services.integrations.anilist import (
    ANIME,
    BATCH_SIZE,
    MANGA,
    AniListRateLimiter,
    anilist_record,
    fetch_anilist_batch,
    prime_anilist_cache,
    reset_anilist_cache,
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
    """
    The fake sleep advances the thing sleep is waiting on.

    wait_if_needed re-checks the window after sleeping, so a sleep that does
    not move time forward makes the loop spin until the window ages out for
    real - a 60-second busy-wait that still passes. Ageing the limiter's own
    timestamps simulates elapsed time without monkeypatching time.time, which
    would be a process-wide patch that pytest itself runs under.
    """
    limiter = AniListRateLimiter()
    limiter.max_requests = 2
    slept = []

    def fake_sleep(seconds):
        slept.append(seconds)
        limiter.request_timestamps = [
            t - seconds for t in limiter.request_timestamps
        ]

    monkeypatch.setattr(anilist_module.time, "sleep", fake_sleep)

    started = time.monotonic()
    for _ in range(3):
        limiter.wait_if_needed()
    elapsed = time.monotonic() - started

    assert slept, "the third request in a 2-request window must wait"
    assert sum(slept) >= AniListRateLimiter.WINDOW_SECONDS - 1
    assert elapsed < 5, "the limiter must not busy-wait against a real clock"


# ---------------------------------------------------------------------------
# Run-scoped cache tests
# ---------------------------------------------------------------------------


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


class _Col:
    """
    Stands in for a SQLAlchemy Column. prime_anilist_cache only ever calls
    .isnot() on it and hands the result to a filter this fake ignores, so one
    method is the whole surface.
    """

    def isnot(self, _other):
        return self


class FakeModel:
    mal_id = _Col()


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
