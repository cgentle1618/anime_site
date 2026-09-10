"""
seasonal rows belong to a user.

The counters and my_rating were only ever global because there was one user.
Requires PostgreSQL. See tests/api/conftest.py.
"""

import uuid

import pytest
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError

from app import models
from app.services.security import get_password_hash
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


def test_the_primary_key_is_the_pair(db):
    rows = db.execute(
        text(
            "SELECT a.attname FROM pg_index i "
            "JOIN pg_attribute a ON a.attrelid = i.indrelid "
            "AND a.attnum = ANY(i.indkey) "
            "WHERE i.indrelid = 'seasonal'::regclass AND i.indisprimary"
        )
    ).all()
    assert {r[0] for r in rows} == {"user_id", "seasonal"}


def test_two_users_may_hold_the_same_season(db, owner, other_user):
    db.add(models.Seasonal(user_id=owner.id, seasonal="WIN 2026", my_rating="9"))
    db.add(models.Seasonal(user_id=other_user.id, seasonal="WIN 2026", my_rating="7"))
    db.flush()
    assert db.query(models.Seasonal).filter_by(seasonal="WIN 2026").count() == 2


def test_one_user_may_not_hold_it_twice(db, owner):
    db.add(models.Seasonal(user_id=owner.id, seasonal="WIN 2026"))
    db.add(models.Seasonal(user_id=owner.id, seasonal="WIN 2026"))
    with pytest.raises(IntegrityError):
        db.flush()


def test_deleting_a_user_cascades_their_seasons(db, owner):
    db.add(models.Seasonal(user_id=owner.id, seasonal="WIN 2026"))
    db.flush()
    db.delete(owner)
    db.flush()
    db.expire_all()
    assert db.query(models.Seasonal).count() == 0
