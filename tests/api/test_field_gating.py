"""
A field group the viewer does not hold is stripped from the response.

The regression that matters most here is not the stripping - it is that
stripping must not reach the database. source_other is a real JSONB column, so
nulling it on a live ORM instance would be flushed on the next autoflush and
the value would be gone for everyone, permanently. Every test that blanks a
column therefore also asserts the row still holds it.
"""

import uuid

import pytest

from app import models
from app.services.rbac.permissions import field_group_perm
from app.services.rbac.seed import default_guest_permissions
from tests.api.test_visibility import make_viewer

SOURCES = {"Bilibili": "https://example.invalid/watch"}


@pytest.fixture
def anime_with_sources(db_session, sample_franchise):
    entry = models.Anime(
        system_id=uuid.uuid4(),
        franchise_id=sample_franchise.system_id,
        anime_name_en="Sourced Anime",
        airing_type="TV",
        source_other=SOURCES,
    )
    db_session.add(entry)
    db_session.flush()
    return entry


@pytest.fixture
def movie_with_sources(db_session, sample_franchise):
    entry = models.Movies(
        system_id=uuid.uuid4(),
        franchise_id=sample_franchise.system_id,
        movie_name_en="Sourced Movie",
        source_other=SOURCES,
    )
    db_session.add(entry)
    db_session.flush()
    return entry


@pytest.fixture
def no_sources_client(client, db_session):
    return make_viewer(
        db_session,
        client,
        "nosources",
        default_guest_permissions() - {field_group_perm("sources_other")},
    )


# ---------------------------------------------------------------------------
# The hand-written routers
# ---------------------------------------------------------------------------

def test_a_gated_column_is_null_in_the_list(no_sources_client, anime_with_sources):
    body = no_sources_client.get("/api/anime/").json()
    row = next(e for e in body if e["system_id"] == str(anime_with_sources.system_id))
    assert row["source_other"] is None


def test_a_gated_column_is_null_in_the_detail(no_sources_client, anime_with_sources):
    body = no_sources_client.get(
        f"/api/anime/{anime_with_sources.system_id}"
    ).json()
    assert body["source_other"] is None


def test_the_rest_of_the_entry_survives(no_sources_client, anime_with_sources):
    """Gating one group must not blank the entry."""
    body = no_sources_client.get(
        f"/api/anime/{anime_with_sources.system_id}"
    ).json()
    assert body["anime_name_en"] == "Sourced Anime"


def test_a_holder_still_sees_the_column(client, anime_with_sources):
    """The seeded guest holds every field group, so nothing changes for it."""
    body = client.get(f"/api/anime/{anime_with_sources.system_id}").json()
    assert body["source_other"] == SOURCES


def test_admin_still_sees_the_column(admin_client, anime_with_sources):
    body = admin_client.get(f"/api/anime/{anime_with_sources.system_id}").json()
    assert body["source_other"] == SOURCES


# ---------------------------------------------------------------------------
# The factory-built routers
# ---------------------------------------------------------------------------

def test_the_factory_routers_gate_the_same_column(
    no_sources_client, movie_with_sources
):
    body = no_sources_client.get(
        f"/api/movies/{movie_with_sources.system_id}"
    ).json()
    assert body["source_other"] is None


def test_the_factory_list_gates_the_same_column(
    no_sources_client, movie_with_sources
):
    body = no_sources_client.get("/api/movies/").json()
    row = next(e for e in body if e["system_id"] == str(movie_with_sources.system_id))
    assert row["source_other"] is None


# ---------------------------------------------------------------------------
# The footgun
# ---------------------------------------------------------------------------

def test_gating_does_not_erase_the_stored_value(
    no_sources_client, db_session, anime_with_sources
):
    """
    Nulling a real column on the ORM instance would be flushed to disk. If this
    ever fails, the response is being built by mutating the entity instead of a
    copy of it, and gating has become data loss.
    """
    no_sources_client.get(f"/api/anime/{anime_with_sources.system_id}")
    no_sources_client.get("/api/anime/")

    db_session.expire_all()
    stored = db_session.get(models.Anime, anime_with_sources.system_id)
    assert stored.source_other == SOURCES


# ---------------------------------------------------------------------------
# Credits are a field group too
# ---------------------------------------------------------------------------

def test_a_gated_credit_link_field_is_blank(client, db_session, sample_anime):
    studio = models.Studio(system_id=uuid.uuid4(), name_en="Zvornik Studio")
    db_session.add(studio)
    db_session.flush()
    db_session.add(
        models.MediaCredit(
            system_id=uuid.uuid4(),
            media_type="anime",
            entry_id=sample_anime.system_id,
            role="studio",
            studio_id=studio.system_id,
        )
    )
    db_session.flush()

    # Holding the group: the studio name is served.
    assert "Zvornik Studio" in client.get("/api/anime/").text

    make_viewer(
        db_session,
        client,
        "nocredits",
        default_guest_permissions() - {field_group_perm("credits")},
    )
    assert "Zvornik Studio" not in client.get("/api/anime/").text


def test_gating_empties_credit_refs_too(client, db_session, sample_anime):
    """
    credit_refs names the same people the legacy strings do, so withholding
    Credits must take it as well - a linkable ref leaks the same name the
    string does. It is a dict, so the blank is {}, not None: the response
    field does not accept None and a 500 would be the alternative.
    """
    person = models.Person(system_id=uuid.uuid4(), name_en="Zvornik Composer")
    db_session.add(person)
    db_session.flush()
    db_session.add(
        models.MediaCredit(
            system_id=uuid.uuid4(),
            media_type="anime",
            entry_id=sample_anime.system_id,
            role="composer",
            person_id=person.system_id,
        )
    )
    db_session.flush()

    body = client.get(f"/api/anime/{sample_anime.system_id}").json()
    assert body["credit_refs"]["composer"][0]["display_name"] == "Zvornik Composer"

    make_viewer(
        db_session,
        client,
        "nocredits2",
        default_guest_permissions() - {field_group_perm("credits")},
    )
    body = client.get(f"/api/anime/{sample_anime.system_id}").json()
    assert body["credit_refs"] == {}
    assert "Zvornik Composer" not in client.get("/api/anime/").text


# ---------------------------------------------------------------------------
# Note sections
# ---------------------------------------------------------------------------

@pytest.fixture
def personal_note(db_session, sample_anime):
    n = models.Note(
        system_id=uuid.uuid4(),
        owner_type="anime",
        owner_id=sample_anime.system_id,
        section="personal_reviews",
        content="Zvornik private assessment",
    )
    db_session.add(n)
    db_session.flush()
    return n


@pytest.fixture
def public_note(db_session, sample_anime):
    n = models.Note(
        system_id=uuid.uuid4(),
        owner_type="anime",
        owner_id=sample_anime.system_id,
        section="public_reviews",
        content="A public review anyone may read",
    )
    db_session.add(n)
    db_session.flush()
    return n


def test_a_gated_note_section_is_withheld(
    client, db_session, sample_anime, personal_note, public_note
):
    params = {"owner_type": "anime", "owner_id": str(sample_anime.system_id)}
    # The seeded guest holds personal_notes, so it reads both.
    assert "Zvornik private assessment" in client.get("/api/notes", params=params).text

    make_viewer(
        db_session,
        client,
        "nopersonal",
        default_guest_permissions() - {field_group_perm("personal_notes")},
    )
    body = client.get("/api/notes", params=params).text
    assert "Zvornik private assessment" not in body
    # The rest of the page still renders.
    assert "A public review anyone may read" in body


# ---------------------------------------------------------------------------
# System info: the timestamps
# ---------------------------------------------------------------------------
# system_id is deliberately NOT gated. It is the route parameter of the page
# the viewer is already on, so withholding it would break navigation without
# concealing anything - the detail pages hide the spine text as presentation
# only. created_at/updated_at are in no URL and nothing routes on them, so
# they are the half that can actually be withheld.


@pytest.fixture
def no_system_info_client(client, db_session):
    return make_viewer(
        db_session,
        client,
        "nosysteminfo",
        default_guest_permissions() - {field_group_perm("system_info")},
    )


def test_timestamps_are_null_in_the_list(no_system_info_client, anime_with_sources):
    body = no_system_info_client.get("/api/anime/").json()
    row = next(e for e in body if e["system_id"] == str(anime_with_sources.system_id))
    assert row["created_at"] is None
    assert row["updated_at"] is None


def test_timestamps_are_null_in_the_detail(no_system_info_client, anime_with_sources):
    """
    Also the regression guard for AnimeResponse: its timestamps were the only
    required ones of the eight, so a gated copy failed response validation and
    the route answered 500 rather than a blanked entry.
    """
    response = no_system_info_client.get(f"/api/anime/{anime_with_sources.system_id}")
    assert response.status_code == 200
    body = response.json()
    assert body["created_at"] is None
    assert body["updated_at"] is None


def test_the_entry_id_is_not_gated(no_system_info_client, anime_with_sources):
    """Withholding the id would break every link on the page."""
    body = no_system_info_client.get(
        f"/api/anime/{anime_with_sources.system_id}"
    ).json()
    assert body["system_id"] == str(anime_with_sources.system_id)


def test_the_factory_routers_gate_the_timestamps(
    no_system_info_client, movie_with_sources
):
    body = no_system_info_client.get(
        f"/api/movies/{movie_with_sources.system_id}"
    ).json()
    assert body["created_at"] is None
    assert body["updated_at"] is None


def test_a_holder_still_sees_the_timestamps(client, anime_with_sources):
    body = client.get(f"/api/anime/{anime_with_sources.system_id}").json()
    assert body["updated_at"] is not None


def test_admin_still_sees_the_timestamps(admin_client, anime_with_sources):
    body = admin_client.get(f"/api/anime/{anime_with_sources.system_id}").json()
    assert body["updated_at"] is not None


def test_gating_does_not_erase_the_stored_timestamps(
    no_system_info_client, db_session, anime_with_sources
):
    """The copy-not-setattr rule, for the columns SQLAlchemy maintains itself."""
    no_system_info_client.get(f"/api/anime/{anime_with_sources.system_id}")
    no_system_info_client.get("/api/anime/")

    db_session.expire_all()
    stored = db_session.get(models.Anime, anime_with_sources.system_id)
    assert stored.created_at is not None
    assert stored.updated_at is not None
