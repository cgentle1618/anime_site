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


@pytest.fixture
def movie(db_session, sample_franchise):
    """A real, castable-media_type-but-not-a-casting-type entry: movie is a
    known key in MEDIA_TABLES, but not one of CASTING_MEDIA_TYPES."""
    m = models.Movies(
        system_id=uuid.uuid4(),
        franchise_id=sample_franchise.system_id,
        movie_name_en="Test Movie",
    )
    db_session.add(m)
    db_session.commit()
    return m


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
    """
    The casting shows how she looks in THIS entry; absent that, her portrait.
    character.photo_file is a real, non-None value (see the conftest fixture)
    so this proves the fallback actually ran, not just that both sides
    happened to be None.
    """
    body = {"cast": [{"character_id": str(character.system_id)}]}
    admin_client.put(f"/api/casting/anime/{anime.system_id}", json=body)
    row = admin_client.get(f"/api/casting/anime/{anime.system_id}").json()["cast"][0]
    assert row["photo_file"] == character.photo_file
    assert row["photo_file"] is not None


def test_photo_prefers_the_casting_s_own_over_the_character_s(
    admin_client, anime, character
):
    """The override direction: a casting with its own photo_file wins, the
    character's portrait is only a fallback for when the casting has none."""
    body = {"cast": [{
        "character_id": str(character.system_id),
        "photo_file": "castings/ichika-this-anime.jpg",
    }]}
    admin_client.put(f"/api/casting/anime/{anime.system_id}", json=body)
    row = admin_client.get(f"/api/casting/anime/{anime.system_id}").json()["cast"][0]
    assert row["photo_file"] == "castings/ichika-this-anime.jpg"
    assert row["photo_file"] != character.photo_file


def test_omitted_positions_default_from_payload_order(
    admin_client, anime, character, second_character
):
    body = {"cast": [
        {"character_id": str(character.system_id)},
        {"character_id": str(second_character.system_id)},
    ]}
    admin_client.put(f"/api/casting/anime/{anime.system_id}", json=body)
    rows = admin_client.get(f"/api/casting/anime/{anime.system_id}").json()["cast"]
    assert [r["position"] for r in rows] == [0, 1]
    assert [r["character_id"] for r in rows] == [
        str(character.system_id), str(second_character.system_id)
    ]


def test_a_repeated_put_reusing_a_character_does_not_collide(
    admin_client, anime, character, second_character
):
    """
    replace_casting deletes then inserts; the same character_id appearing in
    both the old and the new payload must not collide with
    uq_character_casting (character_id, media_type, entry_id), and the final
    state must be exactly the second payload - no orphaned or duplicate rows.
    """
    first = {"cast": [
        {"character_id": str(character.system_id), "position": 0},
        {"character_id": str(second_character.system_id), "position": 1},
    ]}
    assert admin_client.put(
        f"/api/casting/anime/{anime.system_id}", json=first
    ).status_code == 200

    second = {"cast": [
        {"character_id": str(character.system_id), "position": 0},
    ]}
    r = admin_client.put(f"/api/casting/anime/{anime.system_id}", json=second)
    assert r.status_code == 200

    rows = admin_client.get(f"/api/casting/anime/{anime.system_id}").json()["cast"]
    assert [r["character_id"] for r in rows] == [str(character.system_id)]


def test_an_unknown_media_type_is_a_400(client, anime):
    assert client.get(f"/api/casting/nonsense/{anime.system_id}").status_code == 400


def test_a_known_but_non_castable_media_type_is_a_422(admin_client, movie):
    """
    "movie" is a real key in MEDIA_TABLES - the entry resolves fine - but it
    is not one of the four castable media types, so this is well-formed but
    inapplicable: 422, not a 400 (that is reserved for a genuinely unknown
    key like "nonsense") and not a 404 (the entry does exist).
    """
    r = admin_client.put(
        f"/api/casting/movie/{movie.system_id}",
        json={"cast": [{"character_id": str(uuid.uuid4())}]},
    )
    assert r.status_code == 422


def test_a_hidden_entry_answers_404(client, hidden_anime):
    """
    A cast names the people on an entry, and a 200 confirms it exists, so a
    hidden entry has to answer exactly as an absent one does.
    """
    assert client.get(f"/api/casting/anime/{hidden_anime.system_id}").status_code == 404


def test_guest_cannot_replace_a_cast(client, anime):
    assert client.put(f"/api/casting/anime/{anime.system_id}", json={"cast": []}).status_code == 401
