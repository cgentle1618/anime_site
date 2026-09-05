"""The character router."""

import uuid

import pytest

from app import models


@pytest.fixture
def anime(sample_anime):
    """Alias for sample_anime, matching the brief's fixture name."""
    return sample_anime


@pytest.fixture
def character(db_session):
    c = models.Character(system_id=uuid.uuid4(), name_en="Ichika")
    db_session.add(c)
    db_session.flush()
    return c


@pytest.fixture
def duplicate_character(db_session, anime):
    """A second character row, cast on the same anime, standing in for a
    duplicate the merge endpoint should fold into `character`."""
    c = models.Character(system_id=uuid.uuid4(), name_en="Ichika (dup)")
    db_session.add(c)
    db_session.flush()
    db_session.add(
        models.CharacterCasting(
            character_id=c.system_id,
            media_type="anime",
            entry_id=anime.system_id,
        )
    )
    db_session.commit()
    return c


@pytest.fixture
def character_with_castings(db_session, character, anime):
    db_session.add(
        models.CharacterCasting(
            character_id=character.system_id,
            media_type="anime",
            entry_id=anime.system_id,
        )
    )
    db_session.commit()
    return character


def test_create_character(admin_client):
    r = admin_client.post("/api/character/", json={"name_en": "Ichika"})
    assert r.status_code == 200
    assert r.json()["display_name"] == "Ichika"


def test_a_nameless_character_is_a_422_not_a_500(admin_client):
    r = admin_client.post("/api/character/", json={"gender": "Female"})
    assert r.status_code == 422


def test_two_posts_of_one_name_create_two_characters(admin_client):
    """
    Decision G. POST /api/person is find-or-create because two spellings of
    one director are one human. Characters are the opposite: the Yuki of one
    work and the Yuki of another are different people, and quietly returning
    the first would fuse two casts. Disambiguation belongs in the cast
    editor's combobox, not in a silent server-side match.
    """
    first = admin_client.post("/api/character/", json={"name_en": "Yuki"}).json()
    second = admin_client.post("/api/character/", json={"name_en": "Yuki"}).json()
    assert first["system_id"] != second["system_id"]


def test_delete_rejects_a_stale_casting_count(admin_client, character_with_castings):
    """
    The admin agreed to destroy a specific amount of casting history. A count
    that moved underneath them - another session casting this character while
    the dialog was open - is not what they agreed to.
    """
    r = admin_client.delete(
        f"/api/character/{character_with_castings.system_id}?castings=99"
    )
    assert r.status_code == 409


def test_delete_succeeds_with_the_right_count(admin_client, character_with_castings):
    r = admin_client.delete(
        f"/api/character/{character_with_castings.system_id}?castings=1"
    )
    assert r.status_code == 200


def test_merge_repoints_castings_and_deletes_the_loser(
    admin_client, character, duplicate_character, anime
):
    r = admin_client.post(
        f"/api/character/{character.system_id}/merge",
        json={"source_id": str(duplicate_character.system_id)},
    )
    assert r.status_code == 200
    assert r.json()["castings_moved"] == 1
    assert (
        admin_client.get(f"/api/character/{duplicate_character.system_id}").status_code
        == 404
    )


def test_guest_cannot_create_a_character(client):
    assert (
        client.post("/api/character/", json={"name_en": "Ichika"}).status_code == 401
    )
