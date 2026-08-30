"""
Anime and Anime Movie are served by the shared media router factory; the two
behaviours that kept them hand-written must survive: anime's airing_season
filter and its synchronous ep_previous derivation on write, and anime movie
having no series at all.

Requires PostgreSQL (anime_site_test DB). See tests/api/conftest.py.
"""

import uuid

from app import models


def test_anime_list_filters_by_airing_season(client, db_session, sample_franchise):
    fid = sample_franchise.system_id
    a = models.Anime(system_id=uuid.uuid4(), franchise_id=fid, anime_name_en="Spring One",
                     release_season="SPR", release_date="2024-04")
    b = models.Anime(system_id=uuid.uuid4(), franchise_id=fid, anime_name_en="Winter One",
                     release_season="WIN", release_date="2024-01")
    db_session.add_all([a, b])
    db_session.flush()

    body = client.get("/api/anime/", params={"airing_season": "SPR 2024"}).text
    assert "Spring One" in body
    assert "Winter One" not in body


def test_anime_create_derives_ep_previous_from_the_earlier_season(admin_client, db_session, sample_franchise):
    fid = str(sample_franchise.system_id)
    first = admin_client.post("/api/anime/", json={
        "anime_name_en": "Frieren", "franchise_id": fid, "airing_type": "TV",
        "season_part": "Season 1", "ep_total": 28,
    })
    assert first.status_code == 201, first.text
    second = admin_client.post("/api/anime/", json={
        "anime_name_en": "Frieren Season 2", "franchise_id": fid, "airing_type": "TV",
        "season_part": "Season 2", "ep_total": 12,
    })
    assert second.status_code == 201, second.text
    assert second.json()["ep_previous"] == 28


def test_anime_movie_create_has_no_series(admin_client, sample_franchise):
    response = admin_client.post("/api/anime-movie/", json={
        "anime_movie_name_en": "Your Name", "franchise_id": str(sample_franchise.system_id),
    })
    assert response.status_code == 201, response.text
    body = response.json()
    assert "series_id" not in body
    assert body["franchise_id"] == str(sample_franchise.system_id)


def test_anime_movie_create_without_a_franchise_creates_one_from_its_titles(admin_client, db_session):
    response = admin_client.post("/api/anime-movie/", json={"anime_movie_name_en": "Your Name"})
    assert response.status_code == 201, response.text
    fran = db_session.get(models.Franchise, response.json()["franchise_id"])
    assert fran.franchise_name_en == "Your Name"


def test_anime_movie_list_filters_by_watching_status(client, db_session, sample_franchise):
    fid = sample_franchise.system_id
    db_session.add_all([
        models.AnimeMovies(system_id=uuid.uuid4(), franchise_id=fid, anime_movie_name_en="Seen", watching_status="Completed"),
        models.AnimeMovies(system_id=uuid.uuid4(), franchise_id=fid, anime_movie_name_en="Unseen", watching_status="Might Watch"),
    ])
    db_session.flush()
    body = client.get("/api/anime-movie/", params={"watching_status": "Completed"}).text
    assert "Seen" in body and "Unseen" not in body
