"""
The data-control router is generated from the pipeline registry; every route
the admin page calls must still exist, and unknown types must be 404s.

Requires PostgreSQL (anime_site_test DB). See tests/api/conftest.py.
"""

import uuid

import pytest

from app.main import app
from app.services.pipelines import replace

MEDIA = ["anime", "anime-movie", "movie", "tv-show", "cartoon", "manga", "novel", "comic"]


def routes():
    return {(m, r.path) for r in app.routes for m in getattr(r, "methods", ())}


@pytest.mark.parametrize("media", MEDIA)
def test_fill_and_single_replace_exist_for_every_type(media):
    assert ("POST", f"/api/data-control/fill/{media}") in routes()
    assert ("POST", f"/api/data-control/replace/{media}/{{entry_id}}") in routes()


@pytest.mark.parametrize("media", [m for m in MEDIA if m != "comic"])
def test_bulk_replace_exists_for_every_type_but_comic(media):
    assert ("POST", f"/api/data-control/replace/{media}") in routes()


def test_orchestrators_and_pull_routes_exist():
    r = routes()
    for path in ("/fill/all", "/replace/all", "/backup", "/pull", "/pull/{tab_name}",
                 "/calculate/all", "/check/duplicates", "/check/remarks"):
        assert ("POST", f"/api/data-control{path}") in r or ("GET", f"/api/data-control{path}") in r, path


def test_unknown_type_is_a_client_error_not_a_500(admin_client):
    # No route matches; the SPA catch-all answers 405 to a POST it does not serve.
    assert admin_client.post("/api/data-control/fill/hologram").status_code in (404, 405)
    assert admin_client.post(f"/api/data-control/replace/hologram/{uuid.uuid4()}").status_code in (404, 405)


def test_single_replace_maps_the_pipeline_status_code(admin_client, monkeypatch):
    async def missing(db, entry_id, action_type="Manual", log_action=True):
        return {"status": "error", "message": "Movie entry not found", "status_code": 404}

    monkeypatch.setattr(replace, "execute_replace_single_movie", missing)
    response = admin_client.post(f"/api/data-control/replace/movie/{uuid.uuid4()}")
    assert response.status_code == 404
    assert response.json()["detail"] == "Movie entry not found"
