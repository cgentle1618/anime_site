"""
API integration tests for POST /{id}/complete endpoints.

Requires PostgreSQL (anime_site_test DB). See tests/api/conftest.py.
"""

import uuid

import pytest

from app import models

# ---------------------------------------------------------------------------
# Additional fixtures (not in conftest — only needed here)
# ---------------------------------------------------------------------------

@pytest.fixture
def sample_anime_movie(db_session, sample_franchise):
    entry = models.AnimeMovies(
        system_id=uuid.uuid4(),
        franchise_id=sample_franchise.system_id,
        anime_movie_name_en="Test Anime Movie",
        watching_status="Watching",
        airing_status="Finished Airing",
    )
    db_session.add(entry)
    db_session.flush()
    return entry


@pytest.fixture
def sample_tv_show(db_session, sample_franchise):
    entry = models.TVShows(
        system_id=uuid.uuid4(),
        franchise_id=sample_franchise.system_id,
        tv_name_en="Test TV Show",
        watching_status="Watching",
        airing_status="Finished Airing",
        ep_total=10,
        ep_fin=5,
    )
    db_session.add(entry)
    db_session.flush()
    return entry


@pytest.fixture
def sample_cartoon(db_session, sample_franchise):
    entry = models.Cartoon(
        system_id=uuid.uuid4(),
        franchise_id=sample_franchise.system_id,
        cartoon_name_en="Test Cartoon",
        watching_status="Watching",
        airing_status="Finished Airing",
        ep_total=8,
        ep_fin=3,
    )
    db_session.add(entry)
    db_session.flush()
    return entry


@pytest.fixture
def sample_movie(db_session, sample_franchise):
    entry = models.Movies(
        system_id=uuid.uuid4(),
        franchise_id=sample_franchise.system_id,
        movie_name_en="Test Movie",
        watching_status="Watching",
        airing_status="Finished Airing",
    )
    db_session.add(entry)
    db_session.flush()
    return entry


@pytest.fixture
def sample_manga(db_session, sample_franchise):
    entry = models.Manga(
        system_id=uuid.uuid4(),
        franchise_id=sample_franchise.system_id,
        manga_name_en="Test Manga",
        reading_status="Reading",
        serialization_status="連載中",
        ch_total=50,
        ch_fin=20,
        vol_total=5,
        vol_fin=2,
        vol_fin_page=100,
    )
    db_session.add(entry)
    db_session.flush()
    return entry


# ---------------------------------------------------------------------------
# Anime /complete
# ---------------------------------------------------------------------------

class TestCompleteAnime:
    def test_admin_can_mark_completed(self, admin_client, sample_anime):
        response = admin_client.post(f"/api/anime/{sample_anime.system_id}/complete")
        assert response.status_code == 200
        data = response.json()
        assert data["watching_status"] == "Completed"
        assert data["airing_status"] == "Finished Airing"

    def test_ep_fin_set_to_ep_total(self, admin_client, db_session, sample_franchise):
        entry = models.Anime(
            system_id=uuid.uuid4(),
            franchise_id=sample_franchise.system_id,
            anime_name_en="Incomplete Anime",
            airing_type="TV",
            airing_status="Finished Airing",
            watching_status="Watching",
            ep_total=24,
            ep_fin=10,
        )
        db_session.add(entry)
        db_session.flush()
        response = admin_client.post(f"/api/anime/{entry.system_id}/complete")
        assert response.status_code == 200
        assert response.json()["ep_fin"] == 24

    def test_guest_cannot_mark_completed(self, client, sample_anime):
        response = client.post(f"/api/anime/{sample_anime.system_id}/complete")
        assert response.status_code == 401

    def test_nonexistent_id_returns_404(self, admin_client):
        response = admin_client.post(f"/api/anime/{uuid.uuid4()}/complete")
        assert response.status_code == 404


# ---------------------------------------------------------------------------
# Anime Movie /complete
# ---------------------------------------------------------------------------

class TestCompleteAnimeMovie:
    def test_admin_can_mark_completed(self, admin_client, sample_anime_movie):
        response = admin_client.post(f"/api/anime-movie/{sample_anime_movie.system_id}/complete")
        assert response.status_code == 200
        data = response.json()
        assert data["watching_status"] == "Completed"
        assert data["airing_status"] == "Finished Airing"

    def test_guest_cannot_mark_completed(self, client, sample_anime_movie):
        response = client.post(f"/api/anime-movie/{sample_anime_movie.system_id}/complete")
        assert response.status_code == 401

    def test_nonexistent_id_returns_404(self, admin_client):
        response = admin_client.post(f"/api/anime-movie/{uuid.uuid4()}/complete")
        assert response.status_code == 404


# ---------------------------------------------------------------------------
# TV Show /complete
# ---------------------------------------------------------------------------

class TestCompleteTVShow:
    def test_admin_can_mark_completed(self, admin_client, sample_tv_show):
        response = admin_client.post(f"/api/tv-shows/{sample_tv_show.system_id}/complete")
        assert response.status_code == 200
        data = response.json()
        assert data["watching_status"] == "Completed"
        assert data["airing_status"] == "Finished Airing"

    def test_ep_fin_set_to_ep_total(self, admin_client, sample_tv_show):
        response = admin_client.post(f"/api/tv-shows/{sample_tv_show.system_id}/complete")
        assert response.status_code == 200
        assert response.json()["ep_fin"] == 10

    def test_guest_cannot_mark_completed(self, client, sample_tv_show):
        response = client.post(f"/api/tv-shows/{sample_tv_show.system_id}/complete")
        assert response.status_code == 401

    def test_nonexistent_id_returns_404(self, admin_client):
        response = admin_client.post(f"/api/tv-shows/{uuid.uuid4()}/complete")
        assert response.status_code == 404


# ---------------------------------------------------------------------------
# Cartoon /complete
# ---------------------------------------------------------------------------

class TestCompleteCartoon:
    def test_admin_can_mark_completed(self, admin_client, sample_cartoon):
        response = admin_client.post(f"/api/cartoon/{sample_cartoon.system_id}/complete")
        assert response.status_code == 200
        data = response.json()
        assert data["watching_status"] == "Completed"
        assert data["airing_status"] == "Finished Airing"

    def test_ep_fin_set_to_ep_total(self, admin_client, sample_cartoon):
        response = admin_client.post(f"/api/cartoon/{sample_cartoon.system_id}/complete")
        assert response.status_code == 200
        assert response.json()["ep_fin"] == 8

    def test_guest_cannot_mark_completed(self, client, sample_cartoon):
        response = client.post(f"/api/cartoon/{sample_cartoon.system_id}/complete")
        assert response.status_code == 401

    def test_nonexistent_id_returns_404(self, admin_client):
        response = admin_client.post(f"/api/cartoon/{uuid.uuid4()}/complete")
        assert response.status_code == 404


# ---------------------------------------------------------------------------
# Movie /complete
# ---------------------------------------------------------------------------

class TestCompleteMovie:
    def test_admin_can_mark_completed(self, admin_client, sample_movie):
        response = admin_client.post(f"/api/movies/{sample_movie.system_id}/complete")
        assert response.status_code == 200
        data = response.json()
        assert data["watching_status"] == "Completed"
        assert data["airing_status"] == "Finished Airing"

    def test_guest_cannot_mark_completed(self, client, sample_movie):
        response = client.post(f"/api/movies/{sample_movie.system_id}/complete")
        assert response.status_code == 401

    def test_nonexistent_id_returns_404(self, admin_client):
        response = admin_client.post(f"/api/movies/{uuid.uuid4()}/complete")
        assert response.status_code == 404


# ---------------------------------------------------------------------------
# Manga /complete
# ---------------------------------------------------------------------------

class TestCompleteManga:
    def test_admin_can_mark_completed(self, admin_client, sample_manga):
        response = admin_client.post(f"/api/manga/{sample_manga.system_id}/complete")
        assert response.status_code == 200
        data = response.json()
        assert data["reading_status"] == "Completed"

    def test_ch_fin_set_to_ch_total(self, admin_client, sample_manga):
        response = admin_client.post(f"/api/manga/{sample_manga.system_id}/complete")
        assert response.json()["ch_fin"] == 50

    def test_vol_fin_set_to_vol_total(self, admin_client, sample_manga):
        response = admin_client.post(f"/api/manga/{sample_manga.system_id}/complete")
        assert response.json()["vol_fin"] == 5

    def test_vol_fin_page_set_to_zero(self, admin_client, sample_manga):
        response = admin_client.post(f"/api/manga/{sample_manga.system_id}/complete")
        assert response.json()["vol_fin_page"] == 0

    def test_serialization_status_set_to_completed(self, admin_client, sample_manga):
        response = admin_client.post(f"/api/manga/{sample_manga.system_id}/complete")
        assert response.json()["serialization_status"] == "完結"

    def test_serialization_status_not_changed_for_cancelled(self, admin_client, db_session, sample_franchise):
        cancelled = models.Manga(
            system_id=uuid.uuid4(),
            franchise_id=sample_franchise.system_id,
            manga_name_en="Cancelled Manga",
            reading_status="Reading",
            serialization_status="腰斬",
        )
        db_session.add(cancelled)
        db_session.flush()
        response = admin_client.post(f"/api/manga/{cancelled.system_id}/complete")
        assert response.status_code == 200
        assert response.json()["serialization_status"] == "腰斬"

    def test_guest_cannot_mark_completed(self, client, sample_manga):
        response = client.post(f"/api/manga/{sample_manga.system_id}/complete")
        assert response.status_code == 401

    def test_nonexistent_id_returns_404(self, admin_client):
        response = admin_client.post(f"/api/manga/{uuid.uuid4()}/complete")
        assert response.status_code == 404
