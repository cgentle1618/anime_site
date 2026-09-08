"""
A failing external write hook must not turn a committed create/update into a
500. The row is already persisted when the hook runs; a 500 made the SPA retry
and create duplicates.

Requires PostgreSQL (anime_site_test DB). See tests/api/conftest.py.
"""

import pytest

from app import models
from app.registry import MEDIA_REGISTRY


@pytest.fixture
def exploding_movie_hook():
    spec = MEDIA_REGISTRY["movie"]
    original = spec.write_hook

    async def boom(db, entry_id, action_type="Auto", log_action=False):
        raise RuntimeError("TMDB is down")

    # MediaTypeSpec is frozen; the router holds the same object, so this is
    # the one way to swap the hook for the duration of a test.
    object.__setattr__(spec, "write_hook", boom)
    yield
    object.__setattr__(spec, "write_hook", original)


def test_create_still_returns_201_and_persists(admin_client, db_session, exploding_movie_hook):
    response = admin_client.post("/api/movies/", json={"movie_name_en": "Heat"})
    assert response.status_code == 201, response.text
    system_id = response.json()["system_id"]
    assert db_session.get(models.Movies, system_id) is not None


def test_update_still_returns_200(admin_client, exploding_movie_hook):
    created = admin_client.post("/api/movies/", json={"movie_name_en": "Heat"}).json()
    response = admin_client.put(
        f"/api/movies/{created['system_id']}", json={"movie_name_en": "Heat (1995)"}
    )
    assert response.status_code == 200, response.text
    assert response.json()["movie_name_en"] == "Heat (1995)"
