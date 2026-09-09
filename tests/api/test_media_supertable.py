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
            "INSERT INTO anime (system_id, media_type, public_id, anime_name_cn, "
            "watching_status) VALUES (:s, 'anime', 999998, '錯型別', 'Might Watch')"
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
