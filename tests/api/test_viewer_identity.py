"""
Who the request belongs to.

plan_next and seasonal rows are per user from Step 3 on. Every per-user route
demands a real account (get_current_user_id, 401 otherwise); the few public
routes that still mention per-user facts - the entry plan flags and the
seasonal search bucket - read viewer_user_id and show nothing when it is None.
There is no fallback to anybody else's rows. Requires PostgreSQL. See
tests/api/conftest.py.
"""

import uuid

import pytest
from fastapi import HTTPException

from app import models
from app.services.rbac.resolver import GUEST_FALLBACK, resolve_viewer, viewer_user_id
from app.services.security import get_password_hash
from tests.api.conftest import role_id_for


@pytest.fixture
def db(db_session):
    return db_session


def _user(db, username, role="admin"):
    # Idempotent: some other test in the same session may already have
    # committed an `admin` row, and this fixture only needs one to exist.
    existing = db.query(models.User).filter_by(username=username).first()
    if existing is not None:
        return existing
    u = models.User(
        id=uuid.uuid4(),
        username=username,
        hashed_password=get_password_hash("x"),
        role_id=role_id_for(db, role),
    )
    db.add(u)
    db.flush()
    return u


def test_the_guest_fallback_has_no_user_id():
    assert GUEST_FALLBACK.user_id is None


def test_viewer_user_id_is_none_for_an_anonymous_viewer():
    assert viewer_user_id(GUEST_FALLBACK) is None


def test_viewer_user_id_is_none_for_no_viewer_at_all():
    # _factory._finish(db, entry, viewer=None) really does happen.
    assert viewer_user_id(None) is None


def test_a_cookieless_request_resolves_to_no_user(db):
    _user(db, "admin")

    class _Req:
        cookies = {}

    assert resolve_viewer(_Req(), db).user_id is None


def test_viewer_user_id_is_the_viewers_own_id(db):
    _user(db, "admin")
    kana = _user(db, "kana")

    class _Req:
        cookies = {}

    anonymous = resolve_viewer(_Req(), db)
    logged_in = type(anonymous)(
        username="kana",
        role_id=anonymous.role_id,
        role_name=anonymous.role_name,
        is_root=False,
        permissions=frozenset(),
        user_id=kana.id,
    )
    # Never the admin account, never the first user: only kana.
    assert viewer_user_id(logged_in) == kana.id


def test_get_current_user_id_rejects_an_anonymous_caller(db):
    from app.dependencies import get_current_user_id

    class _Req:
        cookies = {}

    with pytest.raises(HTTPException) as excinfo:
        get_current_user_id(_Req(), db)
    assert excinfo.value.status_code == 401
