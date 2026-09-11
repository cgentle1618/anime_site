"""
A plan row belongs to the account that made it, so an ordinary member may
write their own.

The three write routes carried Depends(get_current_admin) from when the admin
was the only account, while already taking get_current_user_id on the next
line - so the row was always the caller's, and the gate only decided whether
the caller was allowed to have one.
"""

import uuid

import pytest

from app import models
from app.services.rbac import cache as rbac_cache
from app.services.rbac.seed import ensure_rbac_seed
from app.services.security import create_access_token, get_password_hash


@pytest.fixture
def db(db_session):
    return db_session


@pytest.fixture
def member_client(db, client):
    ensure_rbac_seed(db)
    db.flush()
    role = db.query(models.Role).filter(models.Role.name == "user").one()
    db.add(
        models.User(
            id=uuid.uuid4(),
            username="planner",
            hashed_password=get_password_hash("x"),
            role_id=role.system_id,
        )
    )
    db.flush()
    rbac_cache.bump()
    token = create_access_token({"sub": "planner", "role": "user"})
    client.cookies.set("access_token", f"Bearer {token}")
    return client


def test_a_member_can_create_their_own_plan_row(member_client, sample_anime):
    response = member_client.post(
        "/api/plan-next/",
        json={
            "kind": "next",
            "media_type": "anime",
            "target_id": str(sample_anime.system_id),
            "scope": "entry",
        },
    )
    assert response.status_code in (200, 201), response.text


def test_the_row_belongs_to_the_caller(member_client, db, sample_anime):
    member_client.post(
        "/api/plan-next/",
        json={
            "kind": "next",
            "media_type": "anime",
            "target_id": str(sample_anime.system_id),
            "scope": "entry",
        },
    )
    planner = db.query(models.User).filter(
        models.User.username == "planner"
    ).one()
    rows = db.query(models.PlanNext).filter(
        models.PlanNext.user_id == planner.id
    ).count()
    assert rows == 1


def test_an_anonymous_caller_is_still_refused(client, sample_anime):
    response = client.post(
        "/api/plan-next/",
        json={
            "kind": "next",
            "media_type": "anime",
            "target_id": str(sample_anime.system_id),
            "scope": "entry",
        },
    )
    assert response.status_code == 401
