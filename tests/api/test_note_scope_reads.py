"""
Two viewers, one entry: the same request returns two different personal answers
and one identical catalogue answer.

That is the whole point of scoping. A catalogue note (`public_reviews`) is one
shared row everybody reads; a personal note (`advantages`) is one row per user
and reaches nobody else.
"""

import uuid

import pytest

from app import models


@pytest.fixture
def db(db_session):
    return db_session


@pytest.fixture
def two_authors(db):
    """Two users with notes on the same anime, and the anime."""
    role_id = db.query(models.Role.system_id).first()[0]
    alice = models.User(
        id=uuid.uuid4(), username="alice", hashed_password="x", role_id=role_id
    )
    bob = models.User(
        id=uuid.uuid4(), username="bob", hashed_password="x", role_id=role_id
    )
    db.add_all([alice, bob])
    db.commit()
    return alice, bob


def _note(owner_id, section, content, author_id):
    return models.Note(
        system_id=uuid.uuid4(),
        media_id=owner_id,
        section=section,
        content=content,
        author_id=author_id,
    )


def test_a_viewer_sees_only_their_own_personal_notes(
    db, admin_client, sample_anime, two_authors, admin_user
):
    alice, bob = two_authors
    db.add_all(
        [
            _note(sample_anime.system_id, "advantages", "admin 的優點", admin_user.id),
            _note(sample_anime.system_id, "advantages", "alice 的優點", alice.id),
            _note(sample_anime.system_id, "advantages", "bob 的優點", bob.id),
        ]
    )
    db.commit()

    r = admin_client.get(
        "/api/notes",
        params={"owner_type": "anime", "owner_id": str(sample_anime.system_id)},
    )
    assert r.status_code == 200
    bodies = [n["content"] for n in r.json() if n["section"] == "advantages"]
    assert bodies == ["admin 的優點"]


def test_every_viewer_sees_the_same_catalogue_notes(
    db, admin_client, client, sample_anime, two_authors
):
    alice, _bob = two_authors
    db.add(_note(sample_anime.system_id, "public_reviews", "大眾說好看", alice.id))
    db.commit()

    for c in (admin_client, client):
        r = c.get(
            "/api/notes",
            params={"owner_type": "anime", "owner_id": str(sample_anime.system_id)},
        )
        assert r.status_code == 200
        bodies = [n["content"] for n in r.json() if n["section"] == "public_reviews"]
        assert bodies == ["大眾說好看"]


def test_a_logged_out_viewer_sees_no_personal_notes(
    db, client, sample_anime, two_authors
):
    alice, _bob = two_authors
    db.add(_note(sample_anime.system_id, "advantages", "alice 的優點", alice.id))
    db.commit()

    r = client.get(
        "/api/notes",
        params={"owner_type": "anime", "owner_id": str(sample_anime.system_id)},
    )
    assert r.status_code == 200
    assert not [n for n in r.json() if n["section"] == "advantages"]


def test_the_personal_notes_field_group_never_hides_a_viewers_own_rows(
    db, admin_client, sample_anime, admin_user
):
    """
    field_group.personal_notes gated `personal_reviews` when there was one
    author and it was the admin. Filtering by author already hides everyone
    else's, so applying the group to a viewer's OWN rows would hide their notes
    from themselves - which is not what the group is for.
    """
    db.add(_note(sample_anime.system_id, "personal_reviews", "我的評價", admin_user.id))
    db.commit()

    r = admin_client.get(
        "/api/notes",
        params={"owner_type": "anime", "owner_id": str(sample_anime.system_id)},
    )
    bodies = [n["content"] for n in r.json() if n["section"] == "personal_reviews"]
    assert bodies == ["我的評價"]
