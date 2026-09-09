"""
Every media entry has exactly one media row, and deleting either end cleans up.

The pair (system_id, media_type) is what stops a detail row attaching to a
media row of the wrong type; the trigger is what stops a delete against the
detail table leaving the parent behind.
"""

import pytest
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError

from app import models


@pytest.fixture
def db(db_session):
    return db_session


def test_creating_an_anime_creates_its_media_row(db, sample_franchise):
    a = models.Anime(anime_name_cn="測試", franchise_id=sample_franchise.system_id)
    db.add(a)
    db.commit()

    m = db.query(models.Media).filter_by(system_id=a.system_id).one()
    assert m.media_type == "anime"
    assert m.display_name == "測試"
    assert m.franchise_id == sample_franchise.system_id


def test_deleting_the_media_row_removes_the_anime(db):
    a = models.Anime(anime_name_cn="測試刪除")
    db.add(a)
    db.commit()
    sid = a.system_id

    db.execute(text("DELETE FROM media WHERE system_id = :s"), {"s": sid})
    db.commit()

    assert db.query(models.Anime).filter_by(system_id=sid).first() is None


def test_deleting_the_anime_row_removes_its_media(db):
    """The AFTER DELETE trigger: deleting the child must not orphan the parent."""
    a = models.Anime(anime_name_cn="測試觸發")
    db.add(a)
    db.commit()
    sid = a.system_id

    db.execute(text("DELETE FROM anime WHERE system_id = :s"), {"s": sid})
    db.commit()

    assert db.query(models.Media).filter_by(system_id=sid).first() is None


def test_an_anime_cannot_point_at_a_manga_media_row(db):
    """
    fk_anime_media is DEFERRABLE INITIALLY DEFERRED, so the violation surfaces
    at COMMIT. The fixture commits into a SAVEPOINT, which does not trigger a
    deferred check, so it is forced here the way a real commit would - the same
    pattern as tests/api/test_public_id.py.
    """
    m = models.Media(
        media_type="manga", public_id=999999, display_name="不是動畫"
    )
    db.add(m)
    db.flush()

    db.execute(
        text(
            # watching_status is NOT NULL with a Python-side default, so a raw
            # INSERT has to supply it or the row fails on that instead.
            # public_id is not listed: it lives on `media` now.
            "INSERT INTO anime (system_id, media_type, anime_name_cn, "
            "watching_status) VALUES (:s, 'anime', '錯型別', 'Might Watch')"
        ),
        {"s": m.system_id},
    )
    with pytest.raises(IntegrityError):  # on (system_id, media_type)
        db.execute(text("SET CONSTRAINTS ALL IMMEDIATE"))
    db.rollback()


def test_renaming_an_anime_updates_its_media_row(db):
    """The write side is an ORM event, so a plain attribute assignment counts."""
    a = models.Anime(anime_name_cn="舊名")
    db.add(a)
    db.commit()

    a.anime_name_cn = "新名"
    db.commit()

    m = db.query(models.Media).filter_by(system_id=a.system_id).one()
    assert m.display_name == "新名"


def test_an_unnamed_entry_gets_the_placeholder_display_name(db):
    """
    media.display_name is NOT NULL and compute_display_name refuses to name an
    entry with no name at all, so the write path falls back to the same
    placeholder the backfill migration uses.
    """
    a = models.Anime()
    db.add(a)
    db.commit()

    m = db.query(models.Media).filter_by(system_id=a.system_id).one()
    assert m.display_name == f"(unnamed anime {a.public_id})"


# The other eight types. Name columns re-confirmed against each model's
# _name_fields: movies, tv_shows, cartoons and comic have three, and tv_shows
# uses the tv_ prefix, not tv_show_.
@pytest.mark.parametrize(
    "model, kwargs, key, expected_name",
    [
        (models.AnimeMovies, {"anime_movie_name_cn": "電影"}, "anime-movie", "電影"),
        (models.Movies, {"movie_name_cn": "電影二"}, "movie", "電影二"),
        (models.TVShows, {"tv_name_cn": "影集"}, "tv-show", "影集"),
        (models.Cartoon, {"cartoon_name_cn": "卡通"}, "cartoon", "卡通"),
        (models.Manga, {"manga_name_cn": "漫畫"}, "manga", "漫畫"),
        (models.Novel, {"novel_name_cn": "小說"}, "novel", "小說"),
        (models.Comic, {"comic_name_cn": "美漫"}, "comic", "美漫"),
        (models.Game, {"game_name_cn": "遊戲"}, "game", "遊戲"),
    ],
)
def test_every_type_gets_a_media_row(db, model, kwargs, key, expected_name):
    entry = model(**kwargs)
    db.add(entry)
    db.commit()

    m = db.query(models.Media).filter_by(system_id=entry.system_id).one()
    assert m.media_type == key
    assert m.display_name == expected_name


@pytest.mark.parametrize(
    "model, kwargs, table",
    [
        (models.AnimeMovies, {"anime_movie_name_cn": "刪除"}, "anime_movies"),
        (models.Movies, {"movie_name_cn": "刪除"}, "movies"),
        (models.TVShows, {"tv_name_cn": "刪除"}, "tv_shows"),
        (models.Cartoon, {"cartoon_name_cn": "刪除"}, "cartoons"),
        (models.Manga, {"manga_name_cn": "刪除"}, "manga"),
        (models.Novel, {"novel_name_cn": "刪除"}, "novel"),
        (models.Comic, {"comic_name_cn": "刪除"}, "comic"),
        (models.Game, {"game_name_cn": "刪除"}, "games"),
    ],
)
def test_deleting_the_detail_row_removes_its_media(db, model, kwargs, table):
    entry = model(**kwargs)
    db.add(entry)
    db.commit()
    sid = entry.system_id

    db.execute(text(f"DELETE FROM {table} WHERE system_id = :s"), {"s": sid})
    db.commit()

    assert db.query(models.Media).filter_by(system_id=sid).first() is None


def test_an_anime_movie_has_no_series(db, sample_series):
    """
    anime_movies is the one type with no series_id column, so its media row
    must carry NULL there however the entry was written.
    """
    m = models.AnimeMovies(anime_movie_name_cn="無系列")
    db.add(m)
    db.commit()

    row = db.query(models.Media).filter_by(system_id=m.system_id).one()
    assert row.series_id is None


def test_every_media_table_has_its_delete_trigger_in_the_database(db):
    """
    The database-level companion to tests/unit/test_media_constraints.py. The
    suite builds its schema with create_all, so this also proves the metadata
    DDL in media_sync.py stays in step with the migrations.
    """
    from app.utils.media_resolver import MEDIA_TABLES

    rows = db.execute(
        text("SELECT tgname FROM pg_trigger WHERE NOT tgisinternal")
    ).all()
    present = {r[0] for r in rows}
    for ref in MEDIA_TABLES.values():
        name = f"trg_{ref.model.__table__.name}_delete_media"
        assert name in present, f"missing trigger {name}"
