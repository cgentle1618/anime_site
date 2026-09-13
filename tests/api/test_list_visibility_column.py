"""
users.list_is_public - private by default, per-user.

The default is the whole guarantee: an account created by an admin invitation
must not expose its list until its owner says so, and nothing in the creation
path asks the question.
"""

import pytest

from app import models
from app.services.rbac.seed import USER_ROLE
from app.services.security import get_password_hash


@pytest.fixture
def db(db_session):
    return db_session


@pytest.fixture
def user_role_id(db):
    role = db.query(models.Role).filter(models.Role.name == USER_ROLE).first()
    assert role is not None
    return role.system_id


def test_a_new_user_row_is_private(db, user_role_id):
    u = models.User(
        username="private-by-default",
        hashed_password=get_password_hash("x"),
        role_id=user_role_id,
    )
    db.add(u)
    db.flush()
    db.refresh(u)
    assert u.list_is_public is False


def test_the_column_is_not_nullable():
    assert models.User.__table__.c.list_is_public.nullable is False


def test_an_admin_invitation_creates_a_private_account(admin_client, user_role_id):
    r = admin_client.post(
        "/api/users/",
        json={
            "username": "invited",
            "password": "a-password",
            "role_id": str(user_role_id),
        },
    )
    assert r.status_code == 201
    assert r.json()["list_is_public"] is False


def test_the_admin_user_list_reports_the_flag(admin_client, user_role_id):
    admin_client.post(
        "/api/users/",
        json={
            "username": "listed",
            "password": "a-password",
            "role_id": str(user_role_id),
        },
    )
    rows = admin_client.get("/api/users/").json()
    listed = next(row for row in rows if row["username"] == "listed")
    assert listed["list_is_public"] is False
