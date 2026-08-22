"""
API integration tests for /api/watch-order endpoints.

Watch Orders are named, ordered, cross-media-type viewing guides owned by a
Franchise or a Collection.
Requires PostgreSQL (anime_site_test DB). See tests/api/conftest.py.
"""

import uuid

import pytest

from app import models


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def sample_anime_movie(db_session, sample_franchise):
    m = models.AnimeMovies(
        system_id=uuid.uuid4(),
        franchise_id=sample_franchise.system_id,
        anime_movie_name_en="Test Anime Movie",
        watching_status="Completed",
    )
    db_session.add(m)
    db_session.flush()
    return m


@pytest.fixture
def sample_list(db_session, sample_franchise):
    lst = models.WatchOrderList(
        system_id=uuid.uuid4(),
        franchise_id=sample_franchise.system_id,
        list_name="Chronological",
        list_type="Chronological",
        is_default=True,
    )
    db_session.add(lst)
    db_session.flush()
    return lst


@pytest.fixture
def sample_items(db_session, sample_list, sample_anime, sample_anime_movie):
    """A three-step split run: anime ep 1-10 -> movie -> anime ep 11-12."""
    items = [
        models.WatchOrderItem(
            system_id=uuid.uuid4(),
            list_id=sample_list.system_id,
            position=1.0,
            media_type="anime",
            entry_id=sample_anime.system_id,
            ep_start=1,
            ep_end=10,
        ),
        models.WatchOrderItem(
            system_id=uuid.uuid4(),
            list_id=sample_list.system_id,
            position=2.0,
            media_type="anime-movie",
            entry_id=sample_anime_movie.system_id,
            is_optional=True,
            note="Optional side story",
        ),
        models.WatchOrderItem(
            system_id=uuid.uuid4(),
            list_id=sample_list.system_id,
            position=3.0,
            media_type="anime",
            entry_id=sample_anime.system_id,
            ep_start=11,
            ep_end=12,
        ),
    ]
    db_session.add_all(items)
    db_session.flush()
    return items


# ---------------------------------------------------------------------------
# Reads
# ---------------------------------------------------------------------------


class TestGetWatchOrderLists:
    def test_returns_200_and_list(self, client, sample_list):
        response = client.get("/api/watch-order/lists")
        assert response.status_code == 200
        assert isinstance(response.json(), list)

    def test_created_list_appears(self, client, sample_list):
        ids = [row["system_id"] for row in client.get("/api/watch-order/lists").json()]
        assert str(sample_list.system_id) in ids

    def test_franchise_filter_matches(self, client, sample_list, sample_franchise):
        response = client.get(
            f"/api/watch-order/lists?franchise_id={sample_franchise.system_id}"
        )
        assert len(response.json()) == 1

    def test_franchise_filter_excludes_other_owners(self, client, sample_list):
        response = client.get(f"/api/watch-order/lists?franchise_id={uuid.uuid4()}")
        assert response.json() == []

    def test_item_count_is_reported(self, client, sample_list, sample_items):
        response = client.get("/api/watch-order/lists")
        row = next(
            r for r in response.json() if r["system_id"] == str(sample_list.system_id)
        )
        assert row["item_count"] == 3


class TestGetWatchOrderDetail:
    def test_nonexistent_id_returns_404(self, client):
        assert client.get(f"/api/watch-order/lists/{uuid.uuid4()}").status_code == 404

    def test_items_come_back_in_position_order(self, client, sample_list, sample_items):
        data = client.get(f"/api/watch-order/lists/{sample_list.system_id}").json()
        assert [i["position"] for i in data["items"]] == [1.0, 2.0, 3.0]

    def test_items_are_resolved_to_display_data(
        self, client, sample_list, sample_items, sample_anime
    ):
        data = client.get(f"/api/watch-order/lists/{sample_list.system_id}").json()
        first = data["items"][0]
        assert first["missing"] is False
        assert first["display_name"] == "Test Anime"
        assert first["status"] == "Completed"
        assert first["total_episodes"] == 12

    def test_same_entry_can_appear_twice_with_different_ranges(
        self, client, sample_list, sample_items, sample_anime
    ):
        """The split-run case: A ep 1-10 -> B -> A ep 11-12."""
        items = client.get(f"/api/watch-order/lists/{sample_list.system_id}").json()[
            "items"
        ]
        anime_steps = [i for i in items if i["entry_id"] == str(sample_anime.system_id)]
        assert len(anime_steps) == 2
        assert (anime_steps[0]["ep_start"], anime_steps[0]["ep_end"]) == (1, 10)
        assert (anime_steps[1]["ep_start"], anime_steps[1]["ep_end"]) == (11, 12)

    def test_ep_special_is_resolved_onto_the_step(
        self, client, db_session, sample_franchise, sample_list
    ):
        """ep_special 0 is a real episode number, not an absent value."""
        anime = models.Anime(
            system_id=uuid.uuid4(),
            franchise_id=sample_franchise.system_id,
            anime_name_en="Episode Zero",
            airing_type="Special",
            watching_status="Completed",
            ep_special=0,
        )
        db_session.add(anime)
        db_session.flush()
        db_session.add(
            models.WatchOrderItem(
                system_id=uuid.uuid4(),
                list_id=sample_list.system_id,
                position=1.0,
                media_type="anime",
                entry_id=anime.system_id,
            )
        )
        db_session.flush()

        items = client.get(f"/api/watch-order/lists/{sample_list.system_id}").json()[
            "items"
        ]
        assert items[0]["ep_special"] == 0

    def test_optional_flag_and_note_survive(self, client, sample_list, sample_items):
        items = client.get(f"/api/watch-order/lists/{sample_list.system_id}").json()[
            "items"
        ]
        assert items[1]["is_optional"] is True
        assert items[1]["note"] == "Optional side story"

    def test_dangling_entry_is_flagged_not_dropped(
        self, client, db_session, sample_list
    ):
        db_session.add(
            models.WatchOrderItem(
                system_id=uuid.uuid4(),
                list_id=sample_list.system_id,
                position=1.0,
                media_type="anime",
                entry_id=uuid.uuid4(),
            )
        )
        db_session.flush()

        items = client.get(f"/api/watch-order/lists/{sample_list.system_id}").json()[
            "items"
        ]
        assert len(items) == 1
        assert items[0]["missing"] is True
        assert items[0]["display_name"] is None


class TestCandidates:
    def test_franchise_candidates_span_media_types(
        self, client, sample_franchise, sample_anime, sample_anime_movie
    ):
        data = client.get(
            f"/api/watch-order/candidates?franchise_id={sample_franchise.system_id}"
        ).json()
        by_type = {c["media_type"] for c in data}
        assert {"anime", "anime-movie"} <= by_type
        assert any(c["display_name"] == "Test Anime" for c in data)

    def test_collection_candidates_come_from_member_franchises(
        self, client, db_session, sample_collection, sample_collected_franchise
    ):
        db_session.add(
            models.Anime(
                system_id=uuid.uuid4(),
                franchise_id=sample_collected_franchise.system_id,
                anime_name_en="Collected Anime",
                airing_type="TV",
                watching_status="Completed",
            )
        )
        db_session.flush()

        data = client.get(
            f"/api/watch-order/candidates?collection_id={sample_collection.system_id}"
        ).json()
        assert [c["display_name"] for c in data] == ["Collected Anime"]

    def test_candidate_carries_the_fields_a_row_needs(
        self, client, sample_franchise, sample_anime
    ):
        """
        The editor appends a picked candidate straight into its local list, so
        the payload must match the resolver's shape - a missing field would
        render the new row blank until a reload.
        """
        data = client.get(
            f"/api/watch-order/candidates?franchise_id={sample_franchise.system_id}"
        ).json()
        anime = next(c for c in data if c["media_type"] == "anime")
        assert anime["display_name"] == "Test Anime"
        assert anime["status"] == "Completed"
        assert anime["total_episodes"] == 12
        assert anime["franchise_id"] == str(sample_franchise.system_id)

    def test_candidate_carries_ep_special(
        self, client, db_session, sample_franchise
    ):
        db_session.add(
            models.Anime(
                system_id=uuid.uuid4(),
                franchise_id=sample_franchise.system_id,
                anime_name_en="Special Episode",
                airing_type="Special",
                watching_status="Completed",
                ep_special=14.5,
            )
        )
        db_session.flush()

        data = client.get(
            f"/api/watch-order/candidates?franchise_id={sample_franchise.system_id}"
        ).json()
        special = next(c for c in data if c["display_name"] == "Special Episode")
        assert special["ep_special"] == 14.5

    def test_candidates_exclude_other_franchises(
        self, client, sample_anime, sample_franchise
    ):
        data = client.get(
            f"/api/watch-order/candidates?franchise_id={uuid.uuid4()}"
        ).json()
        assert data == []

    def test_no_owner_is_rejected(self, client):
        assert client.get("/api/watch-order/candidates").status_code == 400

    def test_two_owners_are_rejected(
        self, client, sample_franchise, sample_collection
    ):
        response = client.get(
            "/api/watch-order/candidates"
            f"?franchise_id={sample_franchise.system_id}"
            f"&collection_id={sample_collection.system_id}"
        )
        assert response.status_code == 400


# ---------------------------------------------------------------------------
# List writes
# ---------------------------------------------------------------------------


class TestCreateWatchOrderList:
    def test_admin_can_create(self, admin_client, sample_franchise):
        response = admin_client.post(
            "/api/watch-order/lists",
            json={
                "franchise_id": str(sample_franchise.system_id),
                "list_name": "Release Order",
            },
        )
        assert response.status_code in (200, 201)
        assert response.json()["list_name"] == "Release Order"

    def test_guest_cannot_create(self, client, sample_franchise):
        response = client.post(
            "/api/watch-order/lists",
            json={
                "franchise_id": str(sample_franchise.system_id),
                "list_name": "Nope",
            },
        )
        assert response.status_code == 401

    def test_collection_owned_list_is_allowed(self, admin_client, sample_collection):
        response = admin_client.post(
            "/api/watch-order/lists",
            json={
                "collection_id": str(sample_collection.system_id),
                "list_name": "Full Chronology",
            },
        )
        assert response.status_code in (200, 201)

    def test_no_owner_is_rejected(self, admin_client):
        response = admin_client.post(
            "/api/watch-order/lists", json={"list_name": "Ownerless"}
        )
        assert response.status_code == 400

    def test_two_owners_is_rejected(
        self, admin_client, sample_franchise, sample_collection
    ):
        response = admin_client.post(
            "/api/watch-order/lists",
            json={
                "franchise_id": str(sample_franchise.system_id),
                "collection_id": str(sample_collection.system_id),
                "list_name": "Both",
            },
        )
        assert response.status_code == 400

    def test_create_persists_every_field(self, admin_client, sample_franchise):
        payload = {
            "franchise_id": str(sample_franchise.system_id),
            "list_name": "Everything",
            "list_type": "Recommended",
            "is_default": True,
            "sort_index": 2.5,
            "remark": "start here",
        }
        data = admin_client.post("/api/watch-order/lists", json=payload).json()
        for key, expected in payload.items():
            assert data[key] == expected

    def test_new_default_clears_the_previous_default(
        self, admin_client, client, sample_list, sample_franchise
    ):
        """Only one list per owner may be the default."""
        admin_client.post(
            "/api/watch-order/lists",
            json={
                "franchise_id": str(sample_franchise.system_id),
                "list_name": "New Default",
                "is_default": True,
            },
        )
        rows = client.get(
            f"/api/watch-order/lists?franchise_id={sample_franchise.system_id}"
        ).json()
        assert [r["is_default"] for r in rows].count(True) == 1


class TestUpdateWatchOrderList:
    def test_admin_can_patch(self, admin_client, sample_list):
        response = admin_client.patch(
            f"/api/watch-order/lists/{sample_list.system_id}",
            json={"remark": "watch the movie last"},
        )
        assert response.status_code == 200
        assert response.json()["remark"] == "watch the movie last"

    def test_guest_cannot_patch(self, client, sample_list):
        response = client.patch(
            f"/api/watch-order/lists/{sample_list.system_id}", json={"remark": "no"}
        )
        assert response.status_code == 401

    def test_put_updates_name(self, admin_client, sample_list, sample_franchise):
        response = admin_client.put(
            f"/api/watch-order/lists/{sample_list.system_id}",
            json={
                "franchise_id": str(sample_franchise.system_id),
                "list_name": "Renamed",
            },
        )
        assert response.json()["list_name"] == "Renamed"

    def test_nonexistent_returns_404(self, admin_client):
        response = admin_client.patch(
            f"/api/watch-order/lists/{uuid.uuid4()}", json={"remark": "x"}
        )
        assert response.status_code == 404


class TestDeleteWatchOrderList:
    def test_admin_can_delete(self, admin_client, sample_list):
        response = admin_client.delete(
            f"/api/watch-order/lists/{sample_list.system_id}"
        )
        assert response.status_code == 200

    def test_guest_cannot_delete(self, client, sample_list):
        assert (
            client.delete(f"/api/watch-order/lists/{sample_list.system_id}").status_code
            == 401
        )

    def test_delete_cascades_to_items(
        self, admin_client, db_session, sample_list, sample_items
    ):
        admin_client.delete(f"/api/watch-order/lists/{sample_list.system_id}")
        remaining = (
            db_session.query(models.WatchOrderItem)
            .filter(models.WatchOrderItem.list_id == sample_list.system_id)
            .count()
        )
        assert remaining == 0

    def test_delete_leaves_the_media_entry_alone(
        self, admin_client, db_session, sample_list, sample_items, sample_anime
    ):
        admin_client.delete(f"/api/watch-order/lists/{sample_list.system_id}")
        assert (
            db_session.query(models.Anime)
            .filter(models.Anime.system_id == sample_anime.system_id)
            .first()
            is not None
        )


# ---------------------------------------------------------------------------
# Item writes
# ---------------------------------------------------------------------------


class TestCreateWatchOrderItem:
    def test_admin_can_add_item(self, admin_client, sample_list, sample_anime):
        response = admin_client.post(
            f"/api/watch-order/lists/{sample_list.system_id}/items",
            json={"media_type": "anime", "entry_id": str(sample_anime.system_id)},
        )
        assert response.status_code in (200, 201)
        assert response.json()["media_type"] == "anime"

    def test_guest_cannot_add_item(self, client, sample_list, sample_anime):
        response = client.post(
            f"/api/watch-order/lists/{sample_list.system_id}/items",
            json={"media_type": "anime", "entry_id": str(sample_anime.system_id)},
        )
        assert response.status_code == 401

    def test_item_appends_past_the_highest_position(
        self, admin_client, sample_list, sample_items, sample_anime
    ):
        response = admin_client.post(
            f"/api/watch-order/lists/{sample_list.system_id}/items",
            json={"media_type": "anime", "entry_id": str(sample_anime.system_id)},
        )
        assert response.json()["position"] == 4.0

    def test_explicit_position_slots_between_items(
        self, admin_client, sample_list, sample_items, sample_anime
    ):
        """Float positions let an item be inserted without renumbering."""
        response = admin_client.post(
            f"/api/watch-order/lists/{sample_list.system_id}/items",
            json={
                "media_type": "anime",
                "entry_id": str(sample_anime.system_id),
                "position": 1.5,
            },
        )
        assert response.json()["position"] == 1.5

    def test_unknown_media_type_is_rejected(
        self, admin_client, sample_list, sample_anime
    ):
        response = admin_client.post(
            f"/api/watch-order/lists/{sample_list.system_id}/items",
            json={"media_type": "podcast", "entry_id": str(sample_anime.system_id)},
        )
        assert response.status_code == 400

    def test_nonexistent_entry_is_rejected(self, admin_client, sample_list):
        response = admin_client.post(
            f"/api/watch-order/lists/{sample_list.system_id}/items",
            json={"media_type": "anime", "entry_id": str(uuid.uuid4())},
        )
        assert response.status_code == 400

    def test_unknown_list_returns_404(self, admin_client, sample_anime):
        response = admin_client.post(
            f"/api/watch-order/lists/{uuid.uuid4()}/items",
            json={"media_type": "anime", "entry_id": str(sample_anime.system_id)},
        )
        assert response.status_code == 404


class TestUpdateWatchOrderItem:
    def test_patch_updates_episode_range(self, admin_client, sample_items):
        item = sample_items[0]
        response = admin_client.patch(
            f"/api/watch-order/items/{item.system_id}",
            json={"ep_start": 1, "ep_end": 8},
        )
        assert response.status_code == 200
        assert (response.json()["ep_start"], response.json()["ep_end"]) == (1, 8)

    def test_patch_toggles_optional(self, admin_client, sample_items):
        response = admin_client.patch(
            f"/api/watch-order/items/{sample_items[0].system_id}",
            json={"is_optional": True},
        )
        assert response.json()["is_optional"] is True

    def test_guest_cannot_patch(self, client, sample_items):
        response = client.patch(
            f"/api/watch-order/items/{sample_items[0].system_id}",
            json={"note": "no"},
        )
        assert response.status_code == 401

    def test_nonexistent_item_returns_404(self, admin_client):
        response = admin_client.patch(
            f"/api/watch-order/items/{uuid.uuid4()}", json={"note": "x"}
        )
        assert response.status_code == 404


class TestDeleteWatchOrderItem:
    def test_admin_can_delete_item(self, admin_client, sample_list, sample_items):
        admin_client.delete(f"/api/watch-order/items/{sample_items[1].system_id}")
        data = admin_client.get(
            f"/api/watch-order/lists/{sample_list.system_id}"
        ).json()
        assert len(data["items"]) == 2

    def test_guest_cannot_delete_item(self, client, sample_items):
        response = client.delete(
            f"/api/watch-order/items/{sample_items[0].system_id}"
        )
        assert response.status_code == 401


class TestReorder:
    def test_renumbers_positions_to_1_to_n(
        self, admin_client, sample_list, sample_items
    ):
        reversed_ids = [str(i.system_id) for i in reversed(sample_items)]
        response = admin_client.put(
            f"/api/watch-order/lists/{sample_list.system_id}/reorder",
            json={"item_ids": reversed_ids},
        )
        assert response.status_code == 200
        items = response.json()["items"]
        assert [i["position"] for i in items] == [1.0, 2.0, 3.0]
        assert [i["system_id"] for i in items] == reversed_ids

    def test_partial_payload_is_rejected(
        self, admin_client, sample_list, sample_items
    ):
        """A partial payload would silently leave stale positions behind."""
        response = admin_client.put(
            f"/api/watch-order/lists/{sample_list.system_id}/reorder",
            json={"item_ids": [str(sample_items[0].system_id)]},
        )
        assert response.status_code == 400

    def test_duplicate_ids_are_rejected(self, admin_client, sample_list, sample_items):
        dupe = str(sample_items[0].system_id)
        response = admin_client.put(
            f"/api/watch-order/lists/{sample_list.system_id}/reorder",
            json={"item_ids": [dupe, dupe, str(sample_items[1].system_id)]},
        )
        assert response.status_code == 400

    def test_foreign_item_is_rejected(self, admin_client, sample_list, sample_items):
        response = admin_client.put(
            f"/api/watch-order/lists/{sample_list.system_id}/reorder",
            json={"item_ids": [str(uuid.uuid4()) for _ in sample_items]},
        )
        assert response.status_code == 400

    def test_guest_cannot_reorder(self, client, sample_list, sample_items):
        response = client.put(
            f"/api/watch-order/lists/{sample_list.system_id}/reorder",
            json={"item_ids": [str(i.system_id) for i in sample_items]},
        )
        assert response.status_code == 401
