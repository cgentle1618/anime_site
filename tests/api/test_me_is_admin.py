"""
`is_admin` in /api/auth/me means "may edit the catalogue".

It is an alias kept for the SPA's 394 existing call sites, which gate edit
buttons, notes editors and tracker controls - all catalogue-editing concerns.
Redefining it to manage.catalog leaves those correct and correctly opens them
to a super account. The authorization pages ask for admin.authz instead.
"""

import uuid

import pytest

from app import models
from app.services.rbac import cache as rbac_cache
from app.services.rbac.permissions import PERM_ADMIN_AUTHZ, PERM_MANAGE_CATALOG
from app.services.rbac.seed import SUPER_ROLE, ensure_rbac_seed
from app.services.security import create_access_token, get_password_hash


@pytest.fixture
def db(db_session):
    return db_session


def test_a_super_account_reads_as_is_admin(db, client):
    ensure_rbac_seed(db)
    db.flush()
    role = db.query(models.Role).filter(models.Role.name == SUPER_ROLE).one()
    db.add(
        models.User(
            id=uuid.uuid4(),
            username="superme",
            hashed_password=get_password_hash("x"),
            role_id=role.system_id,
        )
    )
    db.flush()
    rbac_cache.bump()
    client.cookies.set(
        "access_token",
        f"Bearer {create_access_token({'sub': 'superme', 'role': SUPER_ROLE})}",
    )

    body = client.get("/api/auth/me").json()
    assert body["is_admin"] is True
    assert PERM_MANAGE_CATALOG in body["permissions"]
    assert PERM_ADMIN_AUTHZ not in body["permissions"]


def test_the_owner_account_still_reads_as_is_admin(admin_client):
    assert admin_client.get("/api/auth/me").json()["is_admin"] is True


def test_a_guest_does_not(client):
    assert client.get("/api/auth/me").json()["is_admin"] is False
