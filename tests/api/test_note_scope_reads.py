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


@pytest.fixture
def game(db, sample_franchise):
    g = models.Game(
        game_name_en="Elden Ring", franchise_id=sample_franchise.system_id
    )
    db.add(g)
    db.commit()
    return g


def test_a_todo_bucket_reaches_only_its_author(
    db, admin_client, game, two_authors, admin_user
):
    """
    todo_* is personal scope. The alice and bob rows are what makes this bite:
    an author filter over a table holding one user's rows passes whether or not
    the filter is applied.
    """
    alice, bob = two_authors
    db.add_all(
        [
            _note(game.system_id, "todo_now", "admin 的待辦", admin_user.id),
            _note(game.system_id, "todo_now", "alice 的待辦", alice.id),
            _note(game.system_id, "todo_now", "bob 的待辦", bob.id),
        ]
    )
    db.commit()

    r = admin_client.get(
        "/api/notes",
        params={"owner_type": "game", "owner_id": str(game.system_id)},
    )
    assert r.status_code == 200
    bodies = [n["content"] for n in r.json() if n["section"] == "todo_now"]
    assert bodies == ["admin 的待辦"]


def test_a_guides_section_is_the_same_for_everyone(
    db, admin_client, client, game, two_authors, admin_user
):
    """
    The mirror of the test above, with the same fixture: it proves the filter
    there did the filtering, rather than something incidental.
    """
    alice, _bob = two_authors
    db.add_all(
        [
            _note(game.system_id, "beginner", "先打史東薇爾", admin_user.id),
            _note(game.system_id, "beginner", "別急著點等級", alice.id),
        ]
    )
    db.commit()

    params = {"owner_type": "game", "owner_id": str(game.system_id)}
    signed_in = admin_client.get("/api/notes", params=params)
    logged_out = client.get("/api/notes", params=params)

    assert signed_in.status_code == logged_out.status_code == 200
    for response in (signed_in, logged_out):
        bodies = sorted(
            n["content"] for n in response.json() if n["section"] == "beginner"
        )
        assert bodies == ["先打史東薇爾", "別急著點等級"]
