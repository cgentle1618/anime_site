"""
Seasonal counters count each user's own list.

Requires PostgreSQL. See tests/api/conftest.py.
"""

import uuid

import pytest

from app import models
from app.services.domain.seasonal import create_missing_seasonal, sync_seasonal_counts
from app.services.security import get_password_hash
from app.utils.constants import WatchStatus
from tests.api.conftest import role_id_for


@pytest.fixture
def db(db_session):
    return db_session


@pytest.fixture
def owner(admin_user):
    """The account admin_client acts as (conftest's admin_user)."""
    return admin_user


@pytest.fixture
def other_user(db_session):
    u = models.User(
        id=uuid.uuid4(),
        username="kana",
        hashed_password=get_password_hash("x"),
        role_id=role_id_for(db_session, "admin"),
    )
    db_session.add(u)
    db_session.flush()
    return u


@pytest.fixture
def winter_anime(db_session, sample_anime):
    sample_anime.release_season = "WIN"
    sample_anime.release_date = "2026-01-10"
    sample_anime.airing_type = "TV"
    db_session.flush()
    return sample_anime


def _list_row(db, user, anime, status):
    # Upsert: the sample fixtures already give the admin a list row, and
    # uq_user_media forbids a second one.
    row = (
        db.query(models.UserMediaList)
        .filter_by(user_id=user.id, media_id=anime.system_id)
        .first()
    )
    if row is None:
        row = models.UserMediaList(
            system_id=uuid.uuid4(),
            user_id=user.id,
            media_id=anime.system_id,
        )
        db.add(row)
    row.status = status
    db.flush()


def test_create_missing_seasonal_makes_one_row_per_user(
    db, owner, other_user, winter_anime
):
    create_missing_seasonal(db)
    rows = db.query(models.Seasonal).filter_by(seasonal="WIN 2026").all()
    assert {owner.id, other_user.id} <= {r.user_id for r in rows}


def test_each_users_counts_are_their_own(db, owner, other_user, winter_anime):
    _list_row(db, owner, winter_anime, WatchStatus.COMPLETED)
    _list_row(db, other_user, winter_anime, WatchStatus.ACTIVE_WATCHING)
    create_missing_seasonal(db)
    sync_seasonal_counts(db)

    mine = (
        db.query(models.Seasonal)
        .filter_by(user_id=owner.id, seasonal="WIN 2026")
        .one()
    )
    theirs = (
        db.query(models.Seasonal)
        .filter_by(user_id=other_user.id, seasonal="WIN 2026")
        .one()
    )

    assert (mine.entry_completed, mine.entry_watching) == (1, 0)
    assert (theirs.entry_completed, theirs.entry_watching) == (0, 1)


def test_a_user_with_no_list_rows_counts_zero(db, owner, other_user, winter_anime):
    _list_row(db, owner, winter_anime, WatchStatus.COMPLETED)
    create_missing_seasonal(db)
    sync_seasonal_counts(db)
    theirs = (
        db.query(models.Seasonal)
        .filter_by(user_id=other_user.id, seasonal="WIN 2026")
        .one()
    )
    assert (
        theirs.entry_planned,
        theirs.entry_completed,
        theirs.entry_watching,
        theirs.entry_dropped,
    ) == (0, 0, 0, 0)


def test_a_second_run_overwrites_rather_than_accumulates(db, owner, winter_anime):
    _list_row(db, owner, winter_anime, WatchStatus.COMPLETED)
    create_missing_seasonal(db)
    sync_seasonal_counts(db)
    sync_seasonal_counts(db)
    mine = (
        db.query(models.Seasonal)
        .filter_by(user_id=owner.id, seasonal="WIN 2026")
        .one()
    )
    assert mine.entry_completed == 1
