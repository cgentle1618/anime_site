"""
Changing who may do what is admin-only.

A super account manages the catalogue and runs pipelines, but must not be able
to grant itself anything, edit a role, create an account, or change a content
label - the labels being what the access-mode axis will scope in Phase B.
"""

import uuid

import pytest

from app import models
from app.services.rbac import cache as rbac_cache
from app.services.rbac.seed import SUPER_ROLE, ensure_rbac_seed
from app.services.security import create_access_token, get_password_hash


@pytest.fixture
def db(db_session):
    return db_session


@pytest.fixture
def super_client(db, client):
    """Logged in as an account holding the `super` role."""
    ensure_rbac_seed(db)
    db.flush()
    role = db.query(models.Role).filter(models.Role.name == SUPER_ROLE).one()
    db.add(
        models.User(
            id=uuid.uuid4(),
            username="supergate",
            hashed_password=get_password_hash("x"),
            role_id=role.system_id,
        )
    )
    db.flush()
    rbac_cache.bump()
    token = create_access_token({"sub": "supergate", "role": SUPER_ROLE})
    client.cookies.set("access_token", f"Bearer {token}")
    return client


@pytest.mark.parametrize(
    "path",
    ["/api/roles/", "/api/users/", "/api/content-labels/"],
)
def test_super_is_refused_the_authorization_routers(super_client, path):
    response = super_client.get(path)
    assert response.status_code == 401
    assert response.headers["WWW-Authenticate"] == "Bearer"


@pytest.mark.parametrize(
    "path",
    ["/api/roles/", "/api/users/", "/api/content-labels/"],
)
def test_the_admin_account_still_reaches_them(admin_client, path):
    assert admin_client.get(path).status_code == 200
