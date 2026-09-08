"""
PATCH bodies are free-form dicts; they must only ever touch real, writable
columns. The old loop did `setattr` for any key `hasattr(entry, key)` - which
includes `system_id`, `created_at`, relationship attributes and SQLAlchemy
internals - so a typo'd or hostile key became a column write.

Requires PostgreSQL (anime_site_test DB). See tests/api/conftest.py.
"""

import uuid

import pytest

PROTECTED = ["system_id", "created_at", "updated_at"]


@pytest.fixture
def anime_url(sample_anime):
    return f"/api/anime/{sample_anime.system_id}"


@pytest.fixture
def franchise_url(sample_franchise):
    return f"/api/franchise/{sample_franchise.system_id}"


@pytest.fixture
def movie_url(admin_client):
    response = admin_client.post("/api/movies/", json={"movie_name_en": "Heat"})
    assert response.status_code == 201, response.text
    return f"/api/movies/{response.json()['system_id']}"


@pytest.mark.parametrize("url_fixture", ["anime_url", "franchise_url", "movie_url"])
@pytest.mark.parametrize("key", PROTECTED)
def test_protected_columns_are_rejected(admin_client, request, url_fixture, key):
    url = request.getfixturevalue(url_fixture)
    before = admin_client.get(url).json()
    value = str(uuid.uuid4()) if key == "system_id" else "2000-01-01T00:00:00"

    response = admin_client.patch(url, json={key: value})

    assert response.status_code == 422, response.text
    assert admin_client.get(url).json()[key] == before[key]


@pytest.mark.parametrize("url_fixture", ["anime_url", "franchise_url", "movie_url"])
def test_relationship_and_unknown_keys_are_ignored_not_written(
    admin_client, request, url_fixture
):
    url = request.getfixturevalue(url_fixture)
    response = admin_client.patch(
        url, json={"franchise": {"evil": True}, "not_a_column": 1, "metadata": {}}
    )
    assert response.status_code == 200, response.text


def test_a_real_column_still_patches(admin_client, anime_url):
    response = admin_client.patch(anime_url, json={"my_rating": "S"})
    assert response.status_code == 200, response.text
    assert response.json()["my_rating"] == "S"
