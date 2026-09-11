"""
The seeded `user` role, as the running app sees it.

conftest's test_engine calls ensure_rbac_seed once per session, so the role is
already in the database here - the same path the lifespan takes.
"""

import pytest

from app import models
from app.services.rbac.permissions import (
    PERM_ADMIN_AUTHZ,
    PERM_MANAGE_CATALOG,
    PERM_MANAGE_PIPELINES,
    PERM_SELF_LIST,
    PERM_SELF_PERSONAL_NOTES,
    media_type_perm,
)
from app.services.rbac.seed import USER_ROLE


@pytest.fixture
def db(db_session):
    return db_session


@pytest.fixture
def user_role(db):
    role = db.query(models.Role).filter(models.Role.name == USER_ROLE).first()
    assert role is not None, "ensure_rbac_seed did not create the user role"
    return role


def test_the_role_is_a_system_role_and_not_a_superuser(user_role):
    assert user_role.is_system is True
    assert user_role.is_superuser is False


def test_its_grants_are_stored(db, user_role):
    held = {
        row.permission
        for row in db.query(models.RolePermission).filter(
            models.RolePermission.role_id == user_role.system_id
        )
    }
    assert PERM_SELF_LIST in held
    assert PERM_SELF_PERSONAL_NOTES in held
    assert media_type_perm("anime") in held
    assert PERM_ADMIN_AUTHZ not in held
    assert PERM_MANAGE_CATALOG not in held
    assert PERM_MANAGE_PIPELINES not in held


def test_an_admin_can_create_an_account_on_it(admin_client, user_role):
    """
    Invite-only accounts. There is no registration route to test the absence
    of - accounts exist only because an admin made one here.
    """
    r = admin_client.post(
        "/api/users/",
        json={
            "username": "invitee",
            "password": "a-password",
            "role_id": str(user_role.system_id),
        },
    )
    assert r.status_code == 201
    assert r.json()["role_name"] == "user"


def test_that_account_is_not_an_admin(client, admin_client, user_role, db):
    from app.services.security import create_access_token

    admin_client.post(
        "/api/users/",
        json={
            "username": "invitee2",
            "password": "a-password",
            "role_id": str(user_role.system_id),
        },
    )
    token = create_access_token({"sub": "invitee2", "role": "user"})
    client.cookies.set("access_token", f"Bearer {token}")

    me = client.get("/api/auth/me").json()
    assert me["username"] == "invitee2"
    assert me["is_admin"] is False
    assert "self.list" in me["permissions"]

    # The one thing that must stay closed: catalogue writes.
    assert client.get("/api/users/").status_code == 401
