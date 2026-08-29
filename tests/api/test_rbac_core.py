"""
The RBAC core: seeded roles, request-to-viewer resolution, and the admin gate
rebuilt on top of them.

The seed is the reason day one behaves exactly like the day before: guest is
granted every media type and every field group, so nothing is hidden until an
admin removes a grant.
"""

import uuid

import pytest

from app import models
from app.services.rbac.field_groups import FIELD_GROUP_KEYS
from app.services.rbac.permissions import (
    PERM_ADMIN,
    field_group_perm,
    media_type_perm,
)
from app.services.rbac.seed import ensure_rbac_seed
from app.services.security import create_access_token, get_password_hash
from app.utils.media_resolver import MEDIA_TYPE_KEYS


def _role(db, name):
    return db.query(models.Role).filter(models.Role.name == name).first()


def _grants(db, name):
    role = _role(db, name)
    return {
        row.permission
        for row in db.query(models.RolePermission).filter(
            models.RolePermission.role_id == role.system_id
        )
    }


# ---------------------------------------------------------------------------
# Seed
# ---------------------------------------------------------------------------

def test_seed_creates_the_two_system_roles(db_session):
    ensure_rbac_seed(db_session)
    for name in ("guest", "admin"):
        role = _role(db_session, name)
        assert role is not None, f"{name} role not seeded"
        assert role.is_system is True


def test_seed_is_idempotent(db_session):
    """It runs from both the lifespan and a migration, against a dirty table."""
    ensure_rbac_seed(db_session)
    before = _grants(db_session, "guest")
    ensure_rbac_seed(db_session)
    assert _grants(db_session, "guest") == before
    assert db_session.query(models.Role).filter(models.Role.name == "guest").count() == 1


def test_admin_is_a_superuser_and_needs_no_grants(db_session):
    ensure_rbac_seed(db_session)
    admin = _role(db_session, "admin")
    assert admin.is_superuser is True


def test_guest_is_granted_every_media_type_and_field_group(db_session):
    """Day one must be behavior-identical: guest sees what it saw before."""
    ensure_rbac_seed(db_session)
    grants = _grants(db_session, "guest")
    for media_type in MEDIA_TYPE_KEYS:
        assert media_type_perm(media_type) in grants
    for key in FIELD_GROUP_KEYS:
        assert field_group_perm(key) in grants


def test_guest_is_not_granted_admin(db_session):
    ensure_rbac_seed(db_session)
    assert PERM_ADMIN not in _grants(db_session, "guest")


# ---------------------------------------------------------------------------
# /api/auth/me
# ---------------------------------------------------------------------------

def test_me_reports_the_guest_role_for_an_anonymous_caller(client):
    body = client.get("/api/auth/me").json()
    assert body["is_admin"] is False
    assert body["username"] is None
    assert body["role"] == "guest"
    assert body["is_superuser"] is False
    assert media_type_perm("anime") in body["permissions"]


def test_me_reports_superuser_for_an_admin(admin_client):
    body = admin_client.get("/api/auth/me").json()
    assert body["is_admin"] is True
    assert body["username"] == "testadmin"
    assert body["is_superuser"] is True


def test_me_survives_a_garbage_cookie(client):
    """Three existing tests depend on /me never raising; keep it that way."""
    client.cookies.set("access_token", "Bearer not-a-jwt")
    response = client.get("/api/auth/me")
    assert response.status_code == 200
    assert response.json()["is_admin"] is False


# ---------------------------------------------------------------------------
# The admin gate
# ---------------------------------------------------------------------------

def test_a_signed_token_for_a_user_that_no_longer_exists_is_rejected(client):
    """
    Previously any validly-signed token claiming role=admin passed, even with
    no user row behind it. The gate now consults the database.
    """
    token = create_access_token({"sub": "ghost", "role": "admin"})
    client.cookies.set("access_token", f"Bearer {token}")
    assert client.get("/api/system/config/current_season").status_code == 401


def test_a_user_whose_role_is_not_admin_is_rejected(client, db_session):
    ensure_rbac_seed(db_session)
    guest_role = _role(db_session, "guest")
    db_session.add(
        models.User(
            id=uuid.uuid4(),
            username="viewer",
            hashed_password=get_password_hash("x"),
            role_id=guest_role.system_id,
        )
    )
    db_session.flush()

    token = create_access_token({"sub": "viewer", "role": "admin"})
    client.cookies.set("access_token", f"Bearer {token}")
    assert client.get("/api/system/config/current_season").status_code == 401


def test_the_role_name_is_readable_off_the_user(client, db_session):
    """
    users.role is a read-only column_property over role.name since migration C.
    auth.py returns it on login and mints it as a JWT claim, so it has to keep
    reading like a plain attribute.
    """
    ensure_rbac_seed(db_session)
    admin_role = _role(db_session, "admin")
    user = models.User(
        id=uuid.uuid4(),
        username="named",
        hashed_password=get_password_hash("x"),
        role_id=admin_role.system_id,
    )
    db_session.add(user)
    db_session.flush()
    db_session.expire(user)

    assert user.role == "admin"
