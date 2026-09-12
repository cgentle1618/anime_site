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
