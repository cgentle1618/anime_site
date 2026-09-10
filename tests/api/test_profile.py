"""
GET /api/profile/{username} - one user's list, all media types.

The three rules this file exists to pin:
  private is 404 to everyone but its owner and an admin;
  a public list is filtered by the READER's permissions, not the owner's;
  personal notes are not on this response at all.
"""

import uuid

import pytest

from app import models
from app.services.rbac.permissions import label_perm, media_type_perm
from app.services.rbac.seed import default_guest_permissions
from app.services.security import get_password_hash
from tests.api.test_visibility import make_viewer


@pytest.fixture
def db(db_session):
    return db_session


@pytest.fixture
def owner(db):
    """A user with a two-entry list. Private until a test says otherwise."""
    role = db.query(models.Role).filter(models.Role.name == "user").one()
    u = models.User(
        id=uuid.uuid4(),
        username="kana",
        hashed_password=get_password_hash("x"),
        role_id=role.system_id,
    )
    db.add(u)
    db.flush()
    return u


@pytest.fixture
def listed(db, owner, sample_anime, sample_manga):
    rows = [
        models.UserMediaList(
            system_id=uuid.uuid4(),
            user_id=owner.id,
            media_id=sample_anime.system_id,
            status="Completed",
            my_rating="S",
        ),
        models.UserMediaList(
            system_id=uuid.uuid4(),
            user_id=owner.id,
            media_id=sample_manga.system_id,
            status="Reading",
            my_rating="B",
        ),
    ]
    db.add_all(rows)
    db.flush()
    return rows


def test_a_private_list_is_404_to_a_stranger(client, owner, listed):
    assert client.get("/api/profile/kana").status_code == 404


def test_a_private_list_is_visible_to_its_owner(db, client, owner, listed):
    from app.services.security import create_access_token

    client.cookies.set(
        "access_token", f"Bearer {create_access_token({'sub': 'kana'})}"
    )
    r = client.get("/api/profile/kana")
    assert r.status_code == 200
    assert r.json()["is_self"] is True
    assert len(r.json()["entries"]) == 2


def test_a_private_list_is_visible_to_an_admin(admin_client, owner, listed):
    r = admin_client.get("/api/profile/kana")
    assert r.status_code == 200
    assert r.json()["is_self"] is False


def test_a_public_list_is_visible_to_a_stranger(db, client, owner, listed):
    owner.list_is_public = True
    db.flush()

    r = client.get("/api/profile/kana")
    assert r.status_code == 200
    body = r.json()
    assert body["username"] == "kana"
    assert body["list_is_public"] is True
    assert {e["media_type"] for e in body["entries"]} == {"anime", "manga"}


def test_entries_are_ordered_best_rated_first(db, client, owner, listed):
    owner.list_is_public = True
    db.flush()

    ratings = [
        e["my_rating"] for e in client.get("/api/profile/kana").json()["entries"]
    ]
    assert ratings == ["S", "B"]


def test_a_media_type_the_reader_may_not_see_is_absent(db, client, owner, listed):
    owner.list_is_public = True
    db.flush()
    make_viewer(
        db,
        client,
        "no-manga",
        default_guest_permissions() - {media_type_perm("manga")},
    )

    types = {
        e["media_type"] for e in client.get("/api/profile/kana").json()["entries"]
    }
    assert types == {"anime"}


def test_a_labelled_entry_is_absent_for_a_reader_lacking_the_label(
    db, client, owner, listed, sample_anime
):
    owner.list_is_public = True
    label = models.ContentLabel(
        system_id=uuid.uuid4(), key="nsfw", label="NSFW", sort_order=0
    )
    db.add(label)
    db.flush()
    db.add(
        models.MediaContentLabel(
            media_id=sample_anime.system_id, label_id=label.system_id, position=0
        )
    )
    db.flush()

    make_viewer(db, client, "untrusted", default_guest_permissions())
    types = {
        e["media_type"] for e in client.get("/api/profile/kana").json()["entries"]
    }
    assert types == {"manga"}

    make_viewer(
        db, client, "trusted", default_guest_permissions() | {label_perm("nsfw")}
    )
    types = {
        e["media_type"] for e in client.get("/api/profile/kana").json()["entries"]
    }
    assert types == {"anime", "manga"}


def test_an_unknown_username_is_404(client):
    assert client.get("/api/profile/nobody").status_code == 404


def test_the_response_carries_no_personal_notes(db, client, owner, listed):
    owner.list_is_public = True
    db.flush()
    body = client.get("/api/profile/kana").json()
    assert "notes" not in body
    assert all("notes" not in e for e in body["entries"])


def test_status_counts_are_reported(db, client, owner, listed):
    owner.list_is_public = True
    db.flush()
    counts = {
        c["status"]: c["count"]
        for c in client.get("/api/profile/kana").json()["counts"]
    }
    assert counts == {"Completed": 1, "Reading": 1}
