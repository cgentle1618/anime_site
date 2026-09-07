"""Fetching a detail page by the id that appears in its URL."""

import pytest

from app import models

# Route prefixes as actually registered in app/registry.py - note "movies" and
# "tv-shows" (plural), not "movie"/"tv-show".
MEDIA_PATHS = [
    "/api/anime",
    "/api/anime-movie",
    "/api/movies",
    "/api/tv-shows",
    "/api/cartoon",
    "/api/manga",
    "/api/novel",
    "/api/comic",
    "/api/game",
]


@pytest.mark.parametrize("base", MEDIA_PATHS)
def test_fetch_by_public_id_matches_fetch_by_system_id(client, media_entry_for, base):
    entry = media_entry_for(base)
    by_uuid = client.get(f"{base}/{entry['system_id']}")
    by_public = client.get(f"{base}/{entry['public_id']}")
    assert by_uuid.status_code == 200
    assert by_public.status_code == 200
    assert by_public.json()["system_id"] == by_uuid.json()["system_id"]


@pytest.mark.parametrize("base", MEDIA_PATHS)
def test_unknown_public_id_is_a_404(client, base):
    assert client.get(f"{base}/99999999").status_code == 404


@pytest.mark.parametrize("base", MEDIA_PATHS)
def test_junk_ref_is_a_404_not_a_500(client, base):
    """A hand-mangled URL must not reach the database layer."""
    assert client.get(f"{base}/not-an-id").status_code == 404


def test_hidden_entry_404s_by_public_id_with_the_same_message(
    client, labelled_hidden_anime
):
    """A hidden entry must be indistinguishable from one that never existed,
    whichever id is used - otherwise public_id becomes an existence oracle."""
    hidden = labelled_hidden_anime
    missing = client.get("/api/anime/99999999")
    hidden_response = client.get(f"/api/anime/{hidden['public_id']}")
    assert hidden_response.status_code == 404
    assert hidden_response.json()["detail"] == missing.json()["detail"]


# ---------------------------------------------------------------------------
# The write verbs resolve a public_id too, and must keep using the row's own
# system_id for everything downstream of the lookup.
# ---------------------------------------------------------------------------


def test_delete_by_public_id_removes_the_cover_under_its_system_id(
    admin_client, db_session, media_entry_for, monkeypatch
):
    """
    The regression the GET-only tests could not see.

    delete() used to hand delete_cover_image the raw URL segment. Once that
    segment can be a public_id, the storage key is computed from "47" instead
    of the UUID, no blob matches, and the real cover is orphaned silently -
    deleting by UUID still worked, so nothing failed loudly.
    """
    from app.routers import _factory

    seen = []
    monkeypatch.setattr(
        _factory, "delete_cover_image", lambda owner, ref: seen.append((owner, ref))
    )

    entry = media_entry_for("/api/anime")
    row = db_session.query(models.Anime).filter_by(system_id=entry["system_id"]).one()
    row.cover_image_file = "anime/whatever.jpg"
    db_session.flush()

    response = admin_client.delete(f"/api/anime/{entry['public_id']}")
    assert response.status_code == 200, response.text
    assert seen == [("anime", str(entry["system_id"]))]


def test_update_by_public_id_edits_the_same_row(admin_client, media_entry_for):
    entry = media_entry_for("/api/anime")
    response = admin_client.patch(
        f"/api/anime/{entry['public_id']}", json={"anime_name_en": "Renamed By PID"}
    )
    assert response.status_code == 200, response.text
    assert response.json()["system_id"] == entry["system_id"]
    assert response.json()["anime_name_en"] == "Renamed By PID"


def test_delete_by_unknown_public_id_is_a_404(admin_client):
    assert admin_client.delete("/api/anime/99999999").status_code == 404
