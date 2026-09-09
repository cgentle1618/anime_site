"""
One acceptance case per media type, added by that type's task.

Each row asserts the same three things: a read serves the personal fields from
the list row, a write lands in the list row, and the entry's own catalogue
column is untouched. Anime has its own richer pair of modules
(test_list_backed_reads.py / test_list_backed_writes.py) because it carries
the most personal columns; these are the ports.

`my_rating` values are letter grades - constants.MY_RATINGS is
("S", "A+", "A", "B", "C", "D", "E", "F"), stored as a String. Never write a
numeric rating here, and never sort or average one in SQL.
"""

import uuid

import pytest

from app import models
from app.services.domain.user_list import DEFAULT_STATUS, acting_user_id


@pytest.fixture
def db(db_session):
    return db_session


# route base -> (model, name column, media_type, status key, a valid status,
#                catalogue column, catalogue value)
CASES = {
    "/api/anime-movie": (
        models.AnimeMovies, "anime_movie_name_en", "anime-movie",
        "watching_status", "Completed", "length_min", 120,
    ),
    "/api/movies": (
        models.Movies, "movie_name_en", "movie",
        "watching_status", "Completed", "length_min", 148,
    ),
    "/api/tv-shows": (
        models.TVShows, "tv_name_en", "tv-show",
        "watching_status", "Completed", "ep_total", 10,
    ),
    "/api/cartoon": (
        models.Cartoon, "cartoon_name_en", "cartoon",
        "watching_status", "Completed", "ep_total", 26,
    ),
    "/api/manga": (
        models.Manga, "manga_name_en", "manga",
        "reading_status", "Completed", "ch_total", 150,
    ),
    "/api/novel": (
        models.Novel, "novel_name_en", "novel",
        "reading_status", "Completed", "vol_total_original", 12,
    ),
    "/api/comic": (
        models.Comic, "comic_name_en", "comic",
        "reading_status", "Completed", "issue_total", 6,
    ),
    "/api/game": (
        models.Game, "game_name_en", "game",
        "playing_status", "Completed", "hltb_main", 24.5,
    ),
}


@pytest.mark.parametrize("base", list(CASES))
def test_create_writes_personal_fields_to_the_list_row(admin_client, db, base):
    model, name_col, media_type, status_key, status, cat_col, cat_val = CASES[base]
    payload = {name_col: "Typed Sentinel", status_key: status,
               "my_rating": "A", cat_col: cat_val}
    response = admin_client.post(f"{base}/", json=payload)
    assert response.status_code == 201, response.text
    body = response.json()
    assert body[status_key] == status
    assert body["my_rating"] == "A"

    row = (
        db.query(models.UserMediaList)
        .filter(models.UserMediaList.media_id == uuid.UUID(body["system_id"]))
        .one()
    )
    assert row.status == status
    assert row.my_rating == "A"
    assert row.user_id == acting_user_id(db, None)


@pytest.mark.parametrize("base", list(CASES))
def test_the_catalogue_column_stays_on_the_detail_table(admin_client, db, base):
    model, name_col, media_type, status_key, status, cat_col, cat_val = CASES[base]
    response = admin_client.post(
        f"{base}/", json={name_col: "Catalogue Sentinel", cat_col: cat_val}
    )
    assert response.status_code == 201, response.text
    entry = db.get(model, uuid.UUID(response.json()["system_id"]))
    assert getattr(entry, cat_col) == cat_val
    assert not hasattr(entry, "my_rating")


@pytest.mark.parametrize("base", list(CASES))
def test_an_entry_with_no_list_row_reads_as_the_type_default(admin_client, db, base):
    model, name_col, media_type, status_key, status, cat_col, cat_val = CASES[base]
    entry = model(system_id=uuid.uuid4())
    setattr(entry, name_col, "Default Sentinel")
    db.add(entry)
    db.flush()
    body = admin_client.get(f"{base}/{entry.system_id}").json()
    assert body[status_key] == DEFAULT_STATUS[media_type]
    assert body["my_rating"] is None


@pytest.mark.parametrize("base", list(CASES))
def test_patch_updates_the_list_row(admin_client, db, base):
    model, name_col, media_type, status_key, status, cat_col, cat_val = CASES[base]
    created = admin_client.post(f"{base}/", json={name_col: "Patch Sentinel"}).json()
    response = admin_client.patch(
        f"{base}/{created['system_id']}", json={"my_rating": "B", status_key: status}
    )
    assert response.status_code == 200, response.text
    row = (
        db.query(models.UserMediaList)
        .filter(models.UserMediaList.media_id == uuid.UUID(created["system_id"]))
        .one()
    )
    assert row.my_rating == "B"
    assert row.status == status
