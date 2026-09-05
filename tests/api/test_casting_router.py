"""
The casting router.

Fixtures `anime` and `character` live in tests/api/conftest.py, shared with
test_character_router.py. `hidden_anime`/`nsfw_label` are imported from
test_visibility.py, matching the pattern the rest of tests/api/ already
uses for that fixture.
"""

import uuid

import pytest

from app import models
from tests.api.test_visibility import hidden_anime, nsfw_label  # noqa: F401


@pytest.fixture
def manga(db_session, sample_franchise):
    m = models.Manga(
        system_id=uuid.uuid4(),
        franchise_id=sample_franchise.system_id,
        manga_name_en="Test Manga",
    )
    db_session.add(m)
    db_session.commit()
    return m


@pytest.fixture
def person(db_session):
    p = models.Person(system_id=uuid.uuid4(), name_jp="花澤香菜")
    db_session.add(p)
    db_session.commit()
    return p


@pytest.fixture
def second_character(db_session):
    c = models.Character(system_id=uuid.uuid4(), name_en="Yuki")
    db_session.add(c)
    db_session.flush()
    return c


def test_get_returns_an_empty_cast_for_a_bare_anime(client, anime):
    r = client.get(f"/api/casting/anime/{anime.system_id}")
    assert r.status_code == 200
    assert r.json()["cast"] == []


def test_put_replaces_the_whole_cast(admin_client, anime, character, person):
    body = {"cast": [{
        "character_id": str(character.system_id),
        "person_id": str(person.system_id),
        "role": "Main",
        "position": 0,
    }]}
    assert admin_client.put(f"/api/casting/anime/{anime.system_id}", json=body).status_code == 200

    rows = admin_client.get(f"/api/casting/anime/{anime.system_id}").json()["cast"]
    assert len(rows) == 1
    assert rows[0]["character_name"] == character.display_name
    assert rows[0]["person_name"] == person.display_name

    assert admin_client.put(
        f"/api/casting/anime/{anime.system_id}", json={"cast": []}
    ).status_code == 200
    assert admin_client.get(f"/api/casting/anime/{anime.system_id}").json()["cast"] == []


def test_cast_is_ordered_by_position(admin_client, anime, character, second_character):
    body = {"cast": [
        {"character_id": str(second_character.system_id), "position": 1},
        {"character_id": str(character.system_id), "position": 0},
    ]}
    admin_client.put(f"/api/casting/anime/{anime.system_id}", json=body)
    rows = admin_client.get(f"/api/casting/anime/{anime.system_id}").json()["cast"]
    assert [r["character_id"] for r in rows] == [
        str(character.system_id), str(second_character.system_id)
    ]


def test_a_seiyuu_on_a_manga_casting_is_rejected(admin_client, manga, character, person):
    """ck_casting_voice_scope, surfaced as a 422 rather than a 500."""
    body = {"cast": [{
        "character_id": str(character.system_id),
        "person_id": str(person.system_id),
    }]}
    r = admin_client.put(f"/api/casting/manga/{manga.system_id}", json=body)
    assert r.status_code == 422


def test_photo_falls_back_to_the_character_portrait(admin_client, anime, character):
    """The casting shows how she looks in THIS entry; absent that, her portrait."""
    body = {"cast": [{"character_id": str(character.system_id)}]}
    admin_client.put(f"/api/casting/anime/{anime.system_id}", json=body)
    row = admin_client.get(f"/api/casting/anime/{anime.system_id}").json()["cast"][0]
    assert row["photo_file"] == character.photo_file


def test_an_unknown_media_type_is_a_400(client, anime):
    assert client.get(f"/api/casting/nonsense/{anime.system_id}").status_code == 400


def test_a_hidden_entry_answers_404(client, hidden_anime):
    """
    A cast names the people on an entry, and a 200 confirms it exists, so a
    hidden entry has to answer exactly as an absent one does.
    """
    assert client.get(f"/api/casting/anime/{hidden_anime.system_id}").status_code == 404


def test_guest_cannot_replace_a_cast(client, anime):
    assert client.put(f"/api/casting/anime/{anime.system_id}", json={"cast": []}).status_code == 401
