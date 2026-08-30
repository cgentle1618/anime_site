"""
The relations graph and scope listing must not name a hidden entry.

/for-entry and every entry route already answer 404 for a labelled entry, but
/api/media-relation/graph and /api/media-relation/?franchise_id= took no
viewer at all, so the hidden entry's display name, search names and cover
were readable from the canvas payload.

Requires PostgreSQL (anime_site_test DB). See tests/api/conftest.py.
"""

import uuid

import pytest

from app import models
from tests.api.test_visibility import HIDDEN_NAME, hidden_anime, nsfw_label  # noqa: F401


@pytest.fixture
def hidden_relation(db_session, sample_anime, hidden_anime):
    row = models.MediaRelation(
        system_id=uuid.uuid4(),
        from_type="anime",
        from_id=hidden_anime.system_id,
        to_type="anime",
        to_id=sample_anime.system_id,
        relation_type="sequel",
    )
    db_session.add(row)
    db_session.flush()
    return row


def test_graph_omits_a_hidden_entry_and_its_edges(
    client, sample_franchise, sample_anime, hidden_relation, hidden_anime
):
    response = client.get(
        "/api/media-relation/graph", params={"franchise_id": str(sample_franchise.system_id)}
    )
    assert response.status_code == 200
    assert HIDDEN_NAME not in response.text
    assert str(hidden_anime.system_id) not in response.text
    body = response.json()
    assert str(sample_anime.system_id) in response.text
    assert body["edges"] == []


def test_scope_listing_omits_relations_touching_a_hidden_entry(
    client, sample_franchise, hidden_relation, hidden_anime
):
    response = client.get(
        "/api/media-relation/", params={"franchise_id": str(sample_franchise.system_id)}
    )
    assert response.status_code == 200
    assert str(hidden_anime.system_id) not in response.text


def test_admin_still_sees_the_hidden_node_and_edge(
    admin_client, sample_franchise, hidden_relation, hidden_anime
):
    response = admin_client.get(
        "/api/media-relation/graph", params={"franchise_id": str(sample_franchise.system_id)}
    )
    assert HIDDEN_NAME in response.text
    assert len(response.json()["edges"]) == 1
