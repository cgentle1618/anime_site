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
            "person", "studio",
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


class TestStaff:
    """People and studios are searchable; characters deliberately are not."""

    @pytest.fixture
    def studio(self, db_session):
        s = models.Studio(system_id=uuid.uuid4(), name_en="Studio Ghibli")
        db_session.add(s)
        db_session.flush()
        return s

    @pytest.fixture
    def jp_person(self, db_session):
        """Named only in Japanese — found by that column or not at all."""
        p = models.Person(system_id=uuid.uuid4(), name_jp="宮崎駿")
        db_session.add(p)
        db_session.flush()
        return p

    def test_person_is_searchable(self, client, person):
        payload = client.get("/api/search/?q=Test+Person").json()
        assert str(person.system_id) in ids(payload, "person")

    def test_studio_is_searchable(self, client, studio):
        payload = client.get("/api/search/?q=ghibli").json()
        assert str(studio.system_id) in ids(payload, "studio")

    def test_any_name_column_matches(self, client, jp_person):
        payload = client.get("/api/search/?q=%E5%AE%AE%E5%B4%8E").json()
        assert str(jp_person.system_id) in ids(payload, "person")

    def test_scope_narrows_to_person(self, client, person, sample_anime):
        payload = client.get("/api/search/?q=Test&scope=person").json()
        assert str(person.system_id) in ids(payload, "person")
        assert ids(payload, "anime") == []

    def test_rows_carry_display_name_and_roles(self, db_session, client, person):
        db_session.add(
            models.PersonRole(person_id=person.system_id, role="director", scope="anime")
        )
        db_session.flush()
        row = next(
            r
            for r in client.get("/api/search/?q=Test+Person").json()["results"]["person"]
            if r["system_id"] == str(person.system_id)
        )
        assert row["display_name"] == "Test Person"
        assert row["roles"] == [{"role": "director", "scope": "anime"}]

    def test_credit_count_is_attached(self, db_session, client, studio, sample_anime):
        db_session.add(
            models.MediaCredit(
                system_id=uuid.uuid4(),
                media_type="anime",
                entry_id=sample_anime.system_id,
                role="studio",
                studio_id=studio.system_id,
            )
        )
        db_session.flush()
        row = next(
            r
            for r in client.get("/api/search/?q=ghibli").json()["results"]["studio"]
            if r["system_id"] == str(studio.system_id)
        )
        assert row["credit_count"] == 1

    def test_character_is_not_searchable(self, client, character):
        """Characters stay out of the universal bar — the scope is rejected."""
        assert client.get("/api/search/?q=Ichika&scope=character").status_code == 422
        assert "character" not in client.get("/api/search/?q=Ichika").json()["results"]
