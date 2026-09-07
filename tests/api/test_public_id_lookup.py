"""Fetching a detail page by the id that appears in its URL."""

import pytest

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
