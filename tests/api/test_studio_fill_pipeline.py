"""
Studio is the first non-media type in the pipeline registry: it fills, but
there is nothing to Replace - a producer record carries no score or rank that
drifts, so a re-fetch would only rewrite what Fill already wrote.

Requires PostgreSQL. See tests/api/conftest.py.
"""

import pytest

from app import models
from app.main import app
from app.services.domain import autofill as autofill_module
from app.services.pipelines import runner as runner_module
from app.services.pipelines.specs import FILL_ALL, PIPELINES, REPLACE_ALL

MAPPA_RESULT = {
    "url": "https://myanimelist.net/anime/producer/569/MAPPA",
    "titles": [{"type": "Japanese", "title": "マッパ"}],
    "images": {"jpg": {"image_url": "https://cdn.myanimelist.net/logo.jpg"}},
    "established": "2011-06-14T00:00:00+00:00",
    "external": [{"name": "mappa.co.jp", "url": "http://www.mappa.co.jp/"}],
}


def routes():
    return {(m, r.path) for r in app.routes for m in getattr(r, "methods", ())}


@pytest.fixture
def patched_tenrai(monkeypatch):
    monkeypatch.setattr(
        autofill_module, "fetch_tenrai_producer_data", lambda mal_id: MAPPA_RESULT
    )
    monkeypatch.setattr(
        autofill_module, "download_cover_image", lambda url, system_id: "stored.jpg"
    )
    # The spec is frozen, so the registry's per-entry MAL pause is skipped by
    # neutering the runner's sleep rather than the spec's fill_sleep.
    async def no_pause(seconds):
        return None

    monkeypatch.setattr(runner_module.asyncio, "sleep", no_pause)


def test_the_fill_route_exists():
    assert ("POST", "/api/data-control/fill/studio") in routes()


def test_no_replace_routes_are_registered_for_studio():
    r = routes()
    assert ("POST", "/api/data-control/replace/studio") not in r
    assert ("POST", "/api/data-control/replace/studio/{entry_id}") not in r


def test_studio_joins_fill_all_but_not_replace_all():
    assert PIPELINES["studio"] in FILL_ALL
    assert PIPELINES["studio"] not in REPLACE_ALL


def test_only_a_studio_with_a_mal_id_is_eligible(db_session):
    spec = PIPELINES["studio"]
    linked = models.Studio(name_en="MAPPA", mal_id=569)
    unlinked = models.Studio(name_en="Bones")
    assert spec.fill_eligible(db_session, linked) is True
    assert spec.fill_eligible(db_session, unlinked) is False


def test_a_filled_studio_is_no_longer_eligible(db_session):
    spec = PIPELINES["studio"]
    done = models.Studio(
        name_en="MAPPA",
        mal_id=569,
        mal_link="https://myanimelist.net/anime/producer/569/MAPPA",
        name_jp="マッパ",
        founded_date="2011-06-14",
        website_url="http://www.mappa.co.jp/",
        logo_file="stored.jpg",
    )
    assert spec.fill_eligible(db_session, done) is False


def test_the_pipeline_fills_a_linked_studio(admin_client, db_session, patched_tenrai):
    studio = models.Studio(name_en="MAPPA", mal_id=569)
    db_session.add(studio)
    db_session.commit()
    studio_id = studio.system_id

    response = admin_client.post("/api/data-control/fill/studio")
    assert response.status_code == 200
    assert "success" in response.text

    db_session.expire_all()
    filled = db_session.get(models.Studio, studio_id)
    assert filled.logo_file == "stored.jpg"
    assert filled.founded_date == "2011-06-14"
    assert filled.website_url == "http://www.mappa.co.jp/"


def test_the_pipeline_extracts_the_mal_id_from_a_pasted_link(
    admin_client, db_session, patched_tenrai
):
    """
    A studio entered with only the producer URL is queued: extract_id runs over
    every row before eligibility is checked, exactly as it does for anime.
    """
    studio = models.Studio(
        name_en="A-1 Pictures",
        mal_link="https://myanimelist.net/anime/producer/56/A-1_Pictures",
    )
    db_session.add(studio)
    db_session.commit()
    studio_id = studio.system_id

    admin_client.post("/api/data-control/fill/studio")

    db_session.expire_all()
    filled = db_session.get(models.Studio, studio_id)
    assert filled.mal_id == 56
    assert filled.logo_file == "stored.jpg"
