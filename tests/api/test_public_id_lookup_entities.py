"""The non-media detail endpoints accept the same two id forms."""

import pytest

from tests.api.conftest import WATCH_ORDER_LIST_BASE

ENTITY_PATHS = [
    "/api/collection",
    "/api/franchise",
    "/api/series",
    "/api/studio",
    "/api/publisher",
    "/api/person",
    "/api/character",
    WATCH_ORDER_LIST_BASE,
]


@pytest.mark.parametrize("base", ENTITY_PATHS)
def test_fetch_by_public_id_matches_fetch_by_system_id(client, entity_for, base):
    entity = entity_for(base)
    by_uuid = client.get(f"{base}/{entity['system_id']}")
    by_public = client.get(f"{base}/{entity['public_id']}")
    assert by_uuid.status_code == 200
    assert by_public.status_code == 200
    assert by_public.json()["system_id"] == by_uuid.json()["system_id"]


@pytest.mark.parametrize("base", ENTITY_PATHS)
def test_unknown_public_id_is_a_404(client, base):
    assert client.get(f"{base}/99999999").status_code == 404


@pytest.mark.parametrize("base", ENTITY_PATHS)
def test_junk_ref_is_a_404_not_a_422(client, base):
    """These endpoints used to annotate the param as UUID, which 422s. A
    detail URL that does not resolve is a missing page, not a bad request."""
    assert client.get(f"{base}/not-an-id").status_code == 404
