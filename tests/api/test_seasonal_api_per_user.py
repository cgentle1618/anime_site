"""
/api/seasonal answers for whoever is asking, and refuses a stranger.

Every route under the prefix is authenticated from Step 3 on: the counters and
the rating are one account's own, so a logged-out visitor gets 401 rather than
a page of somebody else's numbers. Requires PostgreSQL. See
tests/api/conftest.py.

The client here is `super_client`, not `admin_client`: since 2026-09-12 an
administrative account holds no `self.*` grant and every route in this prefix
answers it 401. The `super` role is the account shape that legitimately keeps
a library - it holds both self.* grants and manage.catalog, so the catalogue
writes some of these tests make still land. Spec:
docs/superpowers/specs/2026-09-12-admin-holds-no-user-data.md.
"""

import uuid

import pytest

from app import models
from app.services.security import get_password_hash
from tests.api.conftest import role_id_for


@pytest.fixture
def db(db_session):
    return db_session


@pytest.fixture
def owner(super_user):
    """The account super_client acts as (conftest's super_user)."""
    return super_user


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
def two_ratings(db_session, owner, other_user):
    db_session.add(
        models.Seasonal(user_id=owner.id, seasonal="WIN 2026", my_rating="9")
    )
    db_session.add(
        models.Seasonal(user_id=other_user.id, seasonal="WIN 2026", my_rating="4")
    )
    db_session.flush()


def test_the_list_returns_one_row_per_season_for_the_caller(super_client, two_ratings):
    body = super_client.get("/api/seasonal/").json()
    winters = [row for row in body if row["seasonal"] == "WIN 2026"]
    assert len(winters) == 1
    assert winters[0]["my_rating"] == "9"


def test_every_seasonal_read_refuses_an_anonymous_visitor(client, two_ratings):
    assert client.get("/api/seasonal/").status_code == 401
    assert client.get("/api/seasonal/WIN 2026").status_code == 401
    assert client.get("/api/seasonal/current-season").status_code == 401


def test_the_detail_endpoint_is_scoped(super_client, two_ratings):
    assert super_client.get("/api/seasonal/WIN 2026").json()["my_rating"] == "9"


def test_a_rating_write_touches_only_the_callers_row(
    super_client, db, owner, other_user, two_ratings
):
    response = super_client.patch("/api/seasonal/WIN 2026", json={"my_rating": "10"})
    assert response.status_code == 200
    db.expire_all()
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
    assert mine.my_rating == "10"
    assert theirs.my_rating == "4"


def test_an_anonymous_rating_write_is_rejected(client, two_ratings):
    response = client.patch("/api/seasonal/WIN 2026", json={"my_rating": "1"})
    assert response.status_code == 401
