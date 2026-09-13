"""
The per-user list-visibility toggle.

Everything here acts on the caller and only the caller. There is no user id in
any path: an endpoint that took one would be an endpoint that could be pointed
at somebody else.
"""

import pytest

from app import models
from app.services.rbac.seed import default_guest_permissions
from tests.api.test_visibility import make_viewer


@pytest.fixture
def db(db_session):
    return db_session


def test_an_anonymous_visitor_has_no_settings(client):
    assert client.get("/api/account/settings").status_code == 401


def test_a_signed_in_member_reads_their_own(db, client):
    make_viewer(db, client, "member", default_guest_permissions())
    r = client.get("/api/account/settings")
    assert r.status_code == 200
    assert r.json() == {
        "username": "member",
        "role_name": "role-member",
        "list_is_public": False,
    }


def test_they_can_make_their_list_public(db, client):
    make_viewer(db, client, "member", default_guest_permissions())
    r = client.patch("/api/account/settings", json={"list_is_public": True})
    assert r.status_code == 200
    assert r.json()["list_is_public"] is True

    stored = db.query(models.User).filter(models.User.username == "member").one()
    assert stored.list_is_public is True


def test_and_private_again(db, client):
    make_viewer(db, client, "member", default_guest_permissions())
    client.patch("/api/account/settings", json={"list_is_public": True})
    r = client.patch("/api/account/settings", json={"list_is_public": False})
    assert r.json()["list_is_public"] is False


def test_an_anonymous_visitor_cannot_write_them(client):
    r = client.patch("/api/account/settings", json={"list_is_public": True})
    assert r.status_code == 401


def test_the_payload_carries_no_user_id(db, client):
    """A body field naming somebody else must be ignored, not honoured."""
    make_viewer(db, client, "member", default_guest_permissions())
    make_viewer(db, client, "other", default_guest_permissions())
    # `client` is now logged in as "other" - make_viewer resets the cookie.
    client.patch(
        "/api/account/settings",
        json={"list_is_public": True, "username": "member"},
    )
    member = db.query(models.User).filter(models.User.username == "member").one()
    other = db.query(models.User).filter(models.User.username == "other").one()
    assert member.list_is_public is False
    assert other.list_is_public is True
