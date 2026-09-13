"""
A super account may edit the catalogue; an ordinary member may not.

One representative route per router family rather than all 80: the gate is one
dependency and the swap is mechanical, so the risk is a router MISSED, which
Task 9's deletion of get_current_admin catches by import error. What these
pin is that the permission chosen is the right one.
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


def _login_as(db, client, username, role_name):
    ensure_rbac_seed(db)
    db.flush()
    role = db.query(models.Role).filter(models.Role.name == role_name).one()
    db.add(
        models.User(
            id=uuid.uuid4(),
            username=username,
            hashed_password=get_password_hash("x"),
            role_id=role.system_id,
        )
    )
    db.flush()
    rbac_cache.bump()
    token = create_access_token({"sub": username, "role": role_name})
    client.cookies.set("access_token", f"Bearer {token}")
    return client


def test_a_member_cannot_create_a_collection(db, client):
    _login_as(db, client, "plainmember", "user")
    response = client.post("/api/collection/", json={"collection_name_en": "X"})
    assert response.status_code == 401


def test_super_can_create_a_collection(db, client):
    _login_as(db, client, "supercatalog", SUPER_ROLE)
    response = client.post("/api/collection/", json={"collection_name_en": "X"})
    assert response.status_code in (200, 201)


def test_a_member_cannot_create_a_person(db, client):
    _login_as(db, client, "plainmember2", "user")
    response = client.post("/api/person/", json={"name_en": "Nobody"})
    assert response.status_code == 401


def test_super_can_create_a_person(db, client):
    _login_as(db, client, "supercatalog2", SUPER_ROLE)
    response = client.post("/api/person/", json={"name_en": "Somebody"})
    assert response.status_code in (200, 201)
