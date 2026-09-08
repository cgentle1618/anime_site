"""public_id must reach the client: without it no link can be built."""

import uuid

import pytest

from app import models
from app.services.rbac.permissions import media_type_perm
from tests.api.test_visibility import make_viewer

# (api path segment) for one representative per family. Each is seeded by
# `seeded_entities` below.
LIST_ENDPOINTS = [
    "/api/anime/",
    "/api/collection/",
    "/api/franchise/",
    "/api/person/",
    "/api/studio/",
    "/api/character/",
]


@pytest.fixture
def seeded_entities(db_session, sample_anime, sample_collection, sample_franchise):
    """One row per family in LIST_ENDPOINTS, using the entity fixtures
    already defined in tests/api/conftest.py where they exist, and creating
    the rest (Studio, Character) inline since no shared fixture covers them.
    """
    person = models.Person(system_id=uuid.uuid4(), name_en="Test Person")
    studio = models.Studio(system_id=uuid.uuid4(), name_en="Test Studio")
    character = models.Character(system_id=uuid.uuid4(), name_en="Test Character")
    db_session.add_all([person, studio, character])
    db_session.flush()
    return {
        "anime": sample_anime,
        "collection": sample_collection,
        "franchise": sample_franchise,
        "person": person,
        "studio": studio,
        "character": character,
    }


@pytest.mark.parametrize("path", LIST_ENDPOINTS)
def test_list_endpoints_expose_public_id(client, seeded_entities, path):
    response = client.get(path)
    assert response.status_code == 200
    rows = response.json()
    assert rows, f"{path} returned no rows; the seed fixture did not cover it"
    for row in rows:
        assert isinstance(row["public_id"], int)


def test_public_id_survives_the_narrowest_role(db_session, client, seeded_entities):
    """RBAC gates fields by explicit group; public_id is in none, so a viewer
    holding only the bare permission to see the anime list at all - no field
    group, not even the ones the seeded guest gets by default - still gets
    the id needed to link to a page they may open."""
    narrow_client = make_viewer(
        db_session, client, "narrowest", {media_type_perm("anime")}
    )
    response = narrow_client.get("/api/anime/")
    assert response.status_code == 200
    rows = response.json()
    assert rows, "seeded_entities did not seed an anime row"
    for row in rows:
        assert isinstance(row["public_id"], int)
