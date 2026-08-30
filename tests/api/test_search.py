"""
API integration tests for /api/search — the cross-type search endpoint.

Covers the behaviour the frontend used to implement by downloading every table
and filtering in JS: punctuation-insensitive matching, scope narrowing,
franchise expansion, and seasonal search.

Requires PostgreSQL (anime_site_test DB). See tests/api/conftest.py.
"""

import uuid

import pytest

from app import models


@pytest.fixture
def punctuated_anime(db_session, sample_franchise):
    """An entry whose title only matches once punctuation is normalised away."""
    a = models.Anime(
        system_id=uuid.uuid4(),
        franchise_id=sample_franchise.system_id,
        anime_name_en="Re:Zero - Starting Life",
        airing_type="TV",
        watching_status="Completed",
    )
    db_session.add(a)
    db_session.flush()
    return a


@pytest.fixture
def sample_seasonal(db_session):
    s = models.Seasonal(seasonal="WIN 2026")
    db_session.add(s)
    db_session.flush()
    return s


def ids(payload, bucket):
    return [row["system_id"] for row in payload["results"][bucket]]


class TestQueryHandling:
    def test_returns_all_buckets(self, client, sample_anime):
        payload = client.get("/api/search/?q=Test").json()
        for key in (
            "collection", "franchise", "series", "anime", "anime-movie",
            "movie", "tv-show", "cartoon", "manga", "novel", "comic", "seasonal",
        ):
            assert key in payload["results"]

    def test_blank_query_returns_empty_buckets(self, client, sample_anime):
        payload = client.get("/api/search/?q=  ").json()
        assert all(rows == [] for rows in payload["results"].values())

    def test_no_match_returns_empty(self, client, sample_anime):
        payload = client.get("/api/search/?q=ZZZNoMatch").json()
        assert ids(payload, "anime") == []

    def test_matches_are_case_insensitive(self, client, sample_anime):
        payload = client.get("/api/search/?q=test+anime").json()
        assert str(sample_anime.system_id) in ids(payload, "anime")

    def test_percent_is_not_a_wildcard(self, client, sample_anime):
        """A literal % must not match everything."""
        payload = client.get("/api/search/?q=%25%25%25").json()
        assert ids(payload, "anime") == []


class TestNormalisation:
    def test_spaces_match_across_punctuation(self, client, punctuated_anime):
        """'re zero' finds 'Re:Zero' — the cleanString rule, now in SQL."""
        payload = client.get("/api/search/?q=re+zero").json()
        assert str(punctuated_anime.system_id) in ids(payload, "anime")

    def test_punctuation_in_query_is_ignored(self, client, punctuated_anime):
        payload = client.get("/api/search/?q=re%3Azero").json()
        assert str(punctuated_anime.system_id) in ids(payload, "anime")

    def test_matches_across_a_hyphen(self, client, punctuated_anime):
        payload = client.get("/api/search/?q=zerostarting").json()
        assert str(punctuated_anime.system_id) in ids(payload, "anime")


class TestScope:
    def test_scope_narrows_to_one_type(self, client, sample_anime, sample_franchise):
        payload = client.get("/api/search/?q=Test&scope=franchise").json()
        assert str(sample_franchise.system_id) in ids(payload, "franchise")
        assert ids(payload, "anime") == []

    def test_scope_all_searches_every_type(self, client, sample_anime, sample_franchise):
        payload = client.get("/api/search/?q=Test&scope=all").json()
        assert str(sample_anime.system_id) in ids(payload, "anime")
        assert str(sample_franchise.system_id) in ids(payload, "franchise")

    def test_unknown_scope_is_rejected(self, client):
        assert client.get("/api/search/?q=Test&scope=nonsense").status_code == 422


class TestFranchiseExpansion:
    def test_franchise_match_pulls_in_its_anime(self, db_session, client, sample_franchise):
        """An anime whose own name does not match still surfaces via its franchise."""
        a = models.Anime(
            system_id=uuid.uuid4(),
            franchise_id=sample_franchise.system_id,
            anime_name_en="Totally Unrelated Title",
            airing_type="TV",
            watching_status="Completed",
        )
        db_session.add(a)
        db_session.flush()
        payload = client.get("/api/search/?q=Test+Franchise&scope=all").json()
        assert str(a.system_id) in ids(payload, "anime")

    def test_no_expansion_when_scope_is_anime(self, db_session, client, sample_franchise):
        a = models.Anime(
            system_id=uuid.uuid4(),
            franchise_id=sample_franchise.system_id,
            anime_name_en="Totally Unrelated Title",
            airing_type="TV",
            watching_status="Completed",
        )
        db_session.add(a)
        db_session.flush()
        payload = client.get("/api/search/?q=Test+Franchise&scope=anime").json()
        assert str(a.system_id) not in ids(payload, "anime")

    def test_related_franchises_covers_the_anime_results(
        self, client, sample_anime, sample_franchise
    ):
        payload = client.get("/api/search/?q=Test+Anime&scope=all").json()
        related = [f["system_id"] for f in payload["related_franchises"]]
        assert str(sample_franchise.system_id) in related


class TestSeasonal:
    def test_seasonal_is_searchable(self, client, sample_seasonal):
        payload = client.get("/api/search/?q=WIN+2026").json()
        assert [s["seasonal"] for s in payload["results"]["seasonal"]] == ["WIN 2026"]

    def test_seasonal_normalises_like_the_rest(self, client, sample_seasonal):
        payload = client.get("/api/search/?q=win2026").json()
        assert [s["seasonal"] for s in payload["results"]["seasonal"]] == ["WIN 2026"]


class TestLimits:
    def test_limit_caps_each_bucket(self, db_session, client, sample_franchise):
        for i in range(5):
            db_session.add(
                models.Anime(
                    system_id=uuid.uuid4(),
                    franchise_id=sample_franchise.system_id,
                    anime_name_en=f"Limited Anime {i}",
                    airing_type="TV",
                    watching_status="Completed",
                )
            )
        db_session.flush()
        payload = client.get("/api/search/?q=Limited+Anime&scope=anime&limit=2").json()
        assert len(ids(payload, "anime")) == 2
