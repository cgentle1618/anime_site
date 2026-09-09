"""
The User Media List tab restores through its natural key.

The sheet carries no ids at all: the entry is named by (media_type, public_id)
and the person by username, because a uuid in a sheet belongs to whichever
database last ran a Backup. Pull has to turn that back into a media_id and a
user_id, and must refuse - not guess - when either end is unknown here.
"""

import uuid

import pytest

from app import models
from app.services.pipelines import pull
from app.services.security import get_password_hash
from tests.api.conftest import role_id_for

HEADERS = [
    "media_type", "public_id", "username", "status", "my_rating", "ep_fin",
    "my_watch_day", "completed_at",
]


@pytest.fixture
def db(db_session):
    return db_session


@pytest.fixture
def an_admin(db):
    user = models.User(
        id=uuid.uuid4(),
        username="list_pull_admin",
        hashed_password=get_password_hash("x"),
        role_id=role_id_for(db, "admin"),
    )
    db.add(user)
    db.flush()
    return user


@pytest.fixture
def an_anime(db):
    entry = models.Anime(anime_name_cn="清單匯入")
    db.add(entry)
    db.flush()
    return entry


def _sheet(monkeypatch, rows):
    monkeypatch.setattr(pull, "get_all_raw_rows", lambda tab: [HEADERS] + rows)


def test_a_row_restores_onto_the_right_entry_and_user(
    db, an_admin, an_anime, monkeypatch
):
    _sheet(monkeypatch, [[
        "anime", str(an_anime.public_id), "list_pull_admin",
        "Completed", "S", "12", "Friday", "",
    ]])

    result = pull.execute_pull_specific(db, "User Media List", log_action=False)

    assert result["status"] == "success"
    row = db.query(models.UserMediaList).filter_by(media_id=an_anime.system_id).one()
    assert row.user_id == an_admin.id
    assert row.status == "Completed"
    assert row.my_rating == "S"
    assert row.ep_fin == 12
    assert row.my_watch_day == "Friday"


def test_pulling_the_same_row_twice_updates_rather_than_duplicating(
    db, an_admin, an_anime, monkeypatch
):
    """The natural key is (user, media) - uq_user_media - so a second Pull of
    the same sheet must land on the same row."""
    _sheet(monkeypatch, [[
        "anime", str(an_anime.public_id), "list_pull_admin", "Watching", "A", "3", "", "",
    ]])
    pull.execute_pull_specific(db, "User Media List", log_action=False)

    _sheet(monkeypatch, [[
        "anime", str(an_anime.public_id), "list_pull_admin", "Completed", "S", "12", "", "",
    ]])
    pull.execute_pull_specific(db, "User Media List", log_action=False)

    rows = db.query(models.UserMediaList).filter_by(media_id=an_anime.system_id).all()
    assert len(rows) == 1
    assert rows[0].status == "Completed"
    assert rows[0].ep_fin == 12


def test_a_row_naming_an_unknown_entry_is_skipped_not_inserted(
    db, an_admin, monkeypatch
):
    """A null media_id would be rejected by the FK and take the whole restore
    with it, so the row is dropped and counted instead."""
    before = db.query(models.UserMediaList).count()
    _sheet(monkeypatch, [[
        "anime", "99999999", "list_pull_admin", "Completed", "S", "", "", "",
    ]])

    result = pull.execute_pull_specific(db, "User Media List", log_action=False)

    assert result["status"] == "success"
    assert result["rows_skipped"] == 1
    assert db.query(models.UserMediaList).count() == before


def test_a_row_naming_an_unknown_user_is_skipped_not_inserted(
    db, an_anime, monkeypatch
):
    before = db.query(models.UserMediaList).count()
    _sheet(monkeypatch, [[
        "anime", str(an_anime.public_id), "nobody_here", "Completed", "S", "", "", "",
    ]])

    result = pull.execute_pull_specific(db, "User Media List", log_action=False)

    assert result["rows_skipped"] == 1
    assert db.query(models.UserMediaList).count() == before
