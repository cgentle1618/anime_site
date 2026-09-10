"""Viewer carries the resolved user's id, so a list row can be joined."""

import uuid

import pytest
from fastapi import Request

from app import models
from app.services.domain.user_list import acting_user_id, installation_owner_id
from app.services.rbac.resolver import resolve_viewer
from app.services.security import create_access_token, get_password_hash
from tests.api.conftest import role_id_for


@pytest.fixture
def db(db_session):
    return db_session


def _request(token=None) -> Request:
    headers = []
    if token is not None:
        headers.append((b"cookie", f"access_token=Bearer {token}".encode()))
    return Request({"type": "http", "headers": headers, "method": "GET", "path": "/"})


@pytest.fixture
def an_admin(db):
    """
    An admin whose username sorts first, deliberately.

    acting_user_id resolves a guest to the LOWEST-username admin, so that the
    choice is deterministic on a database that somehow has two. The suite has
    two: the app's lifespan seeds one literally called "admin"
    (app/main.py:108). In production there is only ever that one, so the rule
    and this fixture agree; here the name is what makes the assertion exact
    rather than dependent on which tests ran first.
    """
    user = models.User(
        id=uuid.uuid4(),
        username="aaa_viewer_id_admin",
        hashed_password=get_password_hash("x"),
        role_id=role_id_for(db, "admin"),
    )
    db.add(user)
    db.flush()
    return user


def test_a_logged_in_viewer_carries_its_user_id(db, an_admin):
    token = create_access_token({"sub": "aaa_viewer_id_admin", "role": "admin"})
    viewer = resolve_viewer(_request(token), db)
    assert viewer.user_id == an_admin.id


def test_a_guest_viewer_has_no_user_id(db):
    viewer = resolve_viewer(_request(), db)
    assert viewer.user_id is None


def test_acting_user_id_does_not_fall_back_for_a_guest(db, an_admin):
    """
    It used to. Steps 1 and 2 resolved a guest to the lowest-username admin so
    that the personal columns stayed visible on the public pages while the data
    model went multi-user underneath - which meant a stranger read one
    account's statuses and ratings as facts about the work, and picked the
    account by an accident of username sort. Removed on 2026-09-10: a guest has
    no list and is shown none.

    `installation_owner_id` is what kept the half of the old behaviour that was
    legitimate - naming an owner for a restore or a pipeline - and it is not on
    any request path.
    """
    viewer = resolve_viewer(_request(), db)
    assert acting_user_id(db, viewer) is None
    assert installation_owner_id(db) == an_admin.id
