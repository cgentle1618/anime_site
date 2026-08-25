"""
API integration tests for /api/media-relation.

Requires PostgreSQL (anime_site_test DB). See tests/api/conftest.py.
"""

import uuid

import pytest

from app import models


@pytest.fixture
def second_anime(db_session, sample_franchise):
    a = models.Anime(
        system_id=uuid.uuid4(),
        franchise_id=sample_franchise.system_id,
        anime_name_en="Second Season",
    )
    db_session.add(a)
    db_session.flush()
    return a


@pytest.fixture
def sample_manga_entry(db_session, sample_franchise):
    m = models.Manga(
        system_id=uuid.uuid4(),
        franchise_id=sample_franchise.system_id,
        manga_name_en="Source Manga",
    )
    db_session.add(m)
    db_session.flush()
    return m


# ---------------------------------------------------------------------------
# Kinds
# ---------------------------------------------------------------------------


def test_kinds_lists_the_nine_user_facing_choices(client):
    res = client.get("/api/media-relation/kinds")
    assert res.status_code == 200
    body = res.json()
    assert len(body) == 9
    keys = {k["key"] for k in body}
    assert "prequel" in keys
    prequel = next(k for k in body if k["key"] == "prequel")
    assert prequel["label"] == "Prequel"
    assert prequel["stored_as"] == "sequel"
    sequel = next(k for k in body if k["key"] == "sequel")
    assert sequel["inverse_label"] == "Prequel"
    assert sequel["family"] == "timeline"


# ---------------------------------------------------------------------------
# Create + normalization
# ---------------------------------------------------------------------------


def test_creating_a_prequel_stores_a_swapped_sequel_row(
    admin_client, db_session, sample_anime, second_anime
):
    res = admin_client.post(
        "/api/media-relation/",
        json={
            "from_type": "anime",
            "from_id": str(second_anime.system_id),
            "kind": "prequel",
            "to_type": "anime",
            "to_id": str(sample_anime.system_id),
        },
    )
    assert res.status_code == 201, res.text

    row = db_session.query(models.MediaRelation).one()
    assert row.relation_type == "sequel"
    # The endpoints swapped: sample_anime is the sequel of second_anime.
    assert row.from_id == sample_anime.system_id
    assert row.to_id == second_anime.system_id


def test_creating_a_cross_media_type_adaptation(
    admin_client, sample_anime, sample_manga_entry
):
    res = admin_client.post(
        "/api/media-relation/",
        json={
            "from_type": "anime",
            "from_id": str(sample_anime.system_id),
            "kind": "adaptation",
            "to_type": "manga",
            "to_id": str(sample_manga_entry.system_id),
            "remark": "anime adapts vols 1-7",
        },
    )
    assert res.status_code == 201, res.text
    assert res.json()["relation_type"] == "adaptation"


def test_the_same_alternative_entered_from_either_side_is_one_row(
    admin_client, db_session, sample_anime, second_anime
):
    first = admin_client.post(
        "/api/media-relation/",
        json={
            "from_type": "anime", "from_id": str(sample_anime.system_id),
            "kind": "alternative",
            "to_type": "anime", "to_id": str(second_anime.system_id),
        },
    )
    assert first.status_code == 201

    second = admin_client.post(
        "/api/media-relation/",
        json={
            "from_type": "anime", "from_id": str(second_anime.system_id),
            "kind": "alternative",
            "to_type": "anime", "to_id": str(sample_anime.system_id),
        },
    )
    assert second.status_code == 409
    assert "already" in second.json()["detail"].lower()
    assert db_session.query(models.MediaRelation).count() == 1


def test_self_relation_is_refused(admin_client, sample_anime):
    res = admin_client.post(
        "/api/media-relation/",
        json={
            "from_type": "anime", "from_id": str(sample_anime.system_id),
            "kind": "alternative",
            "to_type": "anime", "to_id": str(sample_anime.system_id),
        },
    )
    assert res.status_code == 409
    assert "itself" in res.json()["detail"].lower()


def test_an_unknown_kind_is_refused(admin_client, sample_anime, second_anime):
    res = admin_client.post(
        "/api/media-relation/",
        json={
            "from_type": "anime", "from_id": str(sample_anime.system_id),
            "kind": "nemesis",
            "to_type": "anime", "to_id": str(second_anime.system_id),
        },
    )
    assert res.status_code == 400
    assert "nemesis" in res.json()["detail"]


def test_an_unknown_media_type_is_refused(admin_client, sample_anime):
    res = admin_client.post(
        "/api/media-relation/",
        json={
            "from_type": "anime", "from_id": str(sample_anime.system_id),
            "kind": "sequel",
            "to_type": "podcast", "to_id": str(uuid.uuid4()),
        },
    )
    assert res.status_code == 400


def test_a_nonexistent_entry_is_refused(admin_client, sample_anime):
    res = admin_client.post(
        "/api/media-relation/",
        json={
            "from_type": "anime", "from_id": str(sample_anime.system_id),
            "kind": "sequel",
            "to_type": "anime", "to_id": str(uuid.uuid4()),
        },
    )
    assert res.status_code == 400


def test_creating_requires_admin(client, sample_anime, second_anime):
    res = client.post(
        "/api/media-relation/",
        json={
            "from_type": "anime", "from_id": str(sample_anime.system_id),
            "kind": "sequel",
            "to_type": "anime", "to_id": str(second_anime.system_id),
        },
    )
    assert res.status_code in (401, 403)


# ---------------------------------------------------------------------------
# Read
# ---------------------------------------------------------------------------


def test_for_entry_returns_both_directions_with_correct_labels(
    admin_client, client, sample_anime, second_anime
):
    admin_client.post(
        "/api/media-relation/",
        json={
            "from_type": "anime", "from_id": str(second_anime.system_id),
            "kind": "sequel",
            "to_type": "anime", "to_id": str(sample_anime.system_id),
        },
    )

    forward = client.get(
        "/api/media-relation/for-entry",
        params={"media_type": "anime", "entry_id": str(second_anime.system_id)},
    ).json()
    # second_anime is the sequel, so the far entry (sample_anime) is its Prequel.
    assert forward[0]["label"] == "Prequel"

    reverse = client.get(
        "/api/media-relation/for-entry",
        params={"media_type": "anime", "entry_id": str(sample_anime.system_id)},
    ).json()
    assert reverse[0]["label"] == "Sequel"
    assert reverse[0]["other"]["display_name"] == second_anime.display_name


def test_for_entry_is_public(client, sample_anime):
    res = client.get(
        "/api/media-relation/for-entry",
        params={"media_type": "anime", "entry_id": str(sample_anime.system_id)},
    )
    assert res.status_code == 200
    assert res.json() == []


def test_scope_listing_returns_relations_within_a_franchise(
    admin_client, client, sample_franchise, sample_anime, second_anime
):
    admin_client.post(
        "/api/media-relation/",
        json={
            "from_type": "anime", "from_id": str(second_anime.system_id),
            "kind": "sequel",
            "to_type": "anime", "to_id": str(sample_anime.system_id),
        },
    )
    res = client.get(
        "/api/media-relation/",
        params={"franchise_id": str(sample_franchise.system_id)},
    )
    assert res.status_code == 200
    assert len(res.json()) == 1


def test_scope_listing_requires_exactly_one_scope(client):
    assert client.get("/api/media-relation/").status_code == 400


# ---------------------------------------------------------------------------
# Update + delete
# ---------------------------------------------------------------------------


def test_patching_the_kind_renormalizes(
    admin_client, db_session, sample_anime, second_anime
):
    created = admin_client.post(
        "/api/media-relation/",
        json={
            "from_type": "anime", "from_id": str(second_anime.system_id),
            "kind": "sequel",
            "to_type": "anime", "to_id": str(sample_anime.system_id),
        },
    ).json()

    res = admin_client.patch(
        f"/api/media-relation/{created['system_id']}",
        json={"kind": "prequel"},
    )
    assert res.status_code == 200

    db_session.expire_all()
    row = db_session.query(models.MediaRelation).one()
    # Still a sequel row, but now pointing the other way.
    assert row.relation_type == "sequel"
    assert row.from_id == sample_anime.system_id
    assert row.to_id == second_anime.system_id


def test_patching_only_the_remark_leaves_direction_alone(
    admin_client, db_session, sample_anime, second_anime
):
    created = admin_client.post(
        "/api/media-relation/",
        json={
            "from_type": "anime", "from_id": str(second_anime.system_id),
            "kind": "sequel",
            "to_type": "anime", "to_id": str(sample_anime.system_id),
        },
    ).json()

    res = admin_client.patch(
        f"/api/media-relation/{created['system_id']}",
        json={"remark": "picks up right after"},
    )
    assert res.status_code == 200
    assert res.json()["remark"] == "picks up right after"

    db_session.expire_all()
    row = db_session.query(models.MediaRelation).one()
    assert row.from_id == second_anime.system_id


def test_deleting_removes_the_row(
    admin_client, db_session, sample_anime, second_anime
):
    created = admin_client.post(
        "/api/media-relation/",
        json={
            "from_type": "anime", "from_id": str(second_anime.system_id),
            "kind": "sequel",
            "to_type": "anime", "to_id": str(sample_anime.system_id),
        },
    ).json()

    res = admin_client.delete(f"/api/media-relation/{created['system_id']}")
    assert res.status_code == 200
    assert db_session.query(models.MediaRelation).count() == 0


def test_deleting_an_unknown_id_is_404(admin_client):
    assert admin_client.delete(
        f"/api/media-relation/{uuid.uuid4()}"
    ).status_code == 404


# ---------------------------------------------------------------------------
# Graph
# ---------------------------------------------------------------------------


def test_graph_lists_every_scope_entry_including_unconnected_ones(
    client, sample_franchise, sample_anime, second_anime
):
    # No relations exist between them, yet both must be drawable: you cannot
    # drag a line from a node that is not on the canvas.
    res = client.get(
        "/api/media-relation/graph",
        params={"franchise_id": str(sample_franchise.system_id)},
    )
    assert res.status_code == 200
    body = res.json()
    keys = {n["key"] for n in body["nodes"]}
    assert f"anime:{sample_anime.system_id}" in keys
    assert f"anime:{second_anime.system_id}" in keys
    assert all(n["in_scope"] for n in body["nodes"])
    assert body["edges"] == []


def test_graph_edges_carry_both_labels_and_the_family(
    admin_client, client, sample_franchise, sample_anime, second_anime
):
    admin_client.post(
        "/api/media-relation/",
        json={
            "from_type": "anime",
            "from_id": str(second_anime.system_id),
            "kind": "sequel",
            "to_type": "anime",
            "to_id": str(sample_anime.system_id),
            "remark": "the direct continuation",
        },
    )

    body = client.get(
        "/api/media-relation/graph",
        params={"franchise_id": str(sample_franchise.system_id)},
    ).json()

    assert len(body["edges"]) == 1
    edge = body["edges"][0]
    assert edge["from"] == f"anime:{second_anime.system_id}"
    assert edge["to"] == f"anime:{sample_anime.system_id}"
    assert edge["relation_type"] == "sequel"
    assert edge["label"] == "Sequel"
    assert edge["inverse_label"] == "Prequel"
    assert edge["family"] == "timeline"
    assert edge["remark"] == "the direct continuation"


def test_graph_adds_a_ghost_node_for_an_out_of_scope_endpoint(
    admin_client, client, db_session, sample_franchise, sample_anime
):
    import uuid as _uuid

    from app import models

    other_franchise = models.Franchise(
        system_id=_uuid.uuid4(), franchise_name_en="Somewhere Else"
    )
    db_session.add(other_franchise)
    db_session.flush()
    outsider = models.Anime(
        system_id=_uuid.uuid4(),
        franchise_id=other_franchise.system_id,
        anime_name_en="Outside Entry",
    )
    db_session.add(outsider)
    db_session.flush()

    admin_client.post(
        "/api/media-relation/",
        json={
            "from_type": "anime",
            "from_id": str(sample_anime.system_id),
            "kind": "spin_off",
            "to_type": "anime",
            "to_id": str(outsider.system_id),
        },
    )

    body = client.get(
        "/api/media-relation/graph",
        params={"franchise_id": str(sample_franchise.system_id)},
    ).json()

    ghost = next(
        n for n in body["nodes"] if n["key"] == f"anime:{outsider.system_id}"
    )
    assert ghost["in_scope"] is False
    assert ghost["missing"] is False
    assert ghost["display_name"] == "Outside Entry"
    assert ghost["franchise_id"] == str(other_franchise.system_id)


def test_graph_marks_a_dangling_target_as_missing(
    admin_client, client, db_session, sample_franchise, sample_anime
):
    import uuid as _uuid

    from app import models

    # Written straight to the table: the API would refuse a nonexistent
    # endpoint, but a row can be orphaned later by deleting the entry.
    orphan_id = _uuid.uuid4()
    db_session.add(
        models.MediaRelation(
            system_id=_uuid.uuid4(),
            from_type="anime",
            from_id=sample_anime.system_id,
            relation_type="adaptation",
            to_type="manga",
            to_id=orphan_id,
        )
    )
    db_session.flush()

    body = client.get(
        "/api/media-relation/graph",
        params={"franchise_id": str(sample_franchise.system_id)},
    ).json()

    ghost = next(n for n in body["nodes"] if n["key"] == f"manga:{orphan_id}")
    assert ghost["missing"] is True
    assert ghost["in_scope"] is False
    assert ghost["display_name"] is None


def test_graph_scope_can_be_a_collection(
    client, db_session, sample_franchise, sample_anime
):
    from app import models

    collection = models.Collection(collection_name_en="A Collection")
    db_session.add(collection)
    db_session.flush()
    sample_franchise.collection_id = collection.system_id
    db_session.flush()

    body = client.get(
        "/api/media-relation/graph",
        params={"collection_id": str(collection.system_id)},
    ).json()

    assert f"anime:{sample_anime.system_id}" in {n["key"] for n in body["nodes"]}


def test_graph_requires_exactly_one_scope(client):
    assert client.get("/api/media-relation/graph").status_code == 400
    assert (
        client.get(
            "/api/media-relation/graph",
            params={"franchise_id": str(uuid.uuid4()), "collection_id": str(uuid.uuid4())},
        ).status_code
        == 400
    )


def test_graph_is_public(client, sample_franchise):
    res = client.get(
        "/api/media-relation/graph",
        params={"franchise_id": str(sample_franchise.system_id)},
    )
    assert res.status_code == 200
