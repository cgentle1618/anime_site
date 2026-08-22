"""
API integration tests for /api/collection endpoints.

Collection is the optional umbrella tier above Franchise.
Requires PostgreSQL (anime_site_test DB). See tests/api/conftest.py.
"""

import uuid


class TestGetAllCollections:
    def test_returns_200_and_list(self, client, sample_collection):
        response = client.get("/api/collection/")
        assert response.status_code == 200
        assert isinstance(response.json(), list)

    def test_created_collection_appears_in_list(self, client, sample_collection):
        response = client.get("/api/collection/")
        ids = [c["system_id"] for c in response.json()]
        assert str(sample_collection.system_id) in ids

    def test_search_query_filters_results(self, client, sample_collection):
        response = client.get("/api/collection/?search_query=Test+Collection")
        data = response.json()
        assert any(c["collection_name_en"] == "Test Collection" for c in data)

    def test_search_query_excludes_non_matching(self, client, sample_collection):
        response = client.get("/api/collection/?search_query=ZZZNoMatch")
        assert response.json() == []


class TestGetCollectionById:
    def test_existing_id_returns_200(self, client, sample_collection):
        response = client.get(f"/api/collection/{sample_collection.system_id}")
        assert response.status_code == 200
        assert response.json()["collection_name_en"] == "Test Collection"

    def test_nonexistent_id_returns_404(self, client):
        response = client.get(f"/api/collection/{uuid.uuid4()}")
        assert response.status_code == 404


class TestCreateCollection:
    def test_admin_can_create(self, admin_client):
        payload = {"collection_name_en": "New Collection"}
        response = admin_client.post("/api/collection/", json=payload)
        assert response.status_code in (200, 201)
        assert response.json()["collection_name_en"] == "New Collection"

    def test_guest_cannot_create(self, client):
        payload = {"collection_name_en": "Unauthorized"}
        response = client.post("/api/collection/", json=payload)
        assert response.status_code == 401

    def test_created_collection_has_system_id(self, admin_client):
        response = admin_client.post(
            "/api/collection/", json={"collection_name_en": "Has UUID"}
        )
        assert "system_id" in response.json()

    def test_create_persists_every_field(self, admin_client, sample_franchise):
        """
        Regression guard. create_franchise used to build the model field-by-field
        and silently dropped cover_entry_id/type_covers/type_slots/
        watch_next_group/to_rewatch. Ensure the Collection router never
        reintroduces that pattern.
        """
        payload = {
            "collection_name_en": "Full Collection",
            "collection_name_cn": "全",
            "collection_name_roman": "Zen",
            "collection_name_jp": "全",
            "collection_name_alt": "Alt",
            "my_rating": "S",
            "collection_expectation": "High",
            "cover_franchise_id": str(sample_franchise.system_id),
            "remark": "a remark",
        }
        data = admin_client.post("/api/collection/", json=payload).json()
        for key, expected in payload.items():
            assert str(data.get(key)) == str(expected), f"{key} was not persisted"


class TestUpdateCollection:
    def test_admin_can_patch(self, admin_client, sample_collection):
        response = admin_client.patch(
            f"/api/collection/{sample_collection.system_id}", json={"my_rating": "A"}
        )
        assert response.status_code == 200
        assert response.json()["my_rating"] == "A"

    def test_guest_cannot_patch(self, client, sample_collection):
        response = client.patch(
            f"/api/collection/{sample_collection.system_id}", json={"my_rating": "A"}
        )
        assert response.status_code == 401

    def test_admin_can_put(self, admin_client, sample_collection):
        response = admin_client.put(
            f"/api/collection/{sample_collection.system_id}",
            json={"collection_name_en": "Renamed"},
        )
        assert response.status_code == 200
        assert response.json()["collection_name_en"] == "Renamed"


class TestDeleteCollection:
    def test_admin_can_delete(self, admin_client, sample_collection):
        response = admin_client.delete(f"/api/collection/{sample_collection.system_id}")
        assert response.status_code == 200
        assert (
            admin_client.get(
                f"/api/collection/{sample_collection.system_id}"
            ).status_code
            == 404
        )

    def test_guest_cannot_delete(self, client, sample_collection):
        assert (
            client.delete(f"/api/collection/{sample_collection.system_id}").status_code
            == 401
        )

    def test_deleting_collection_keeps_member_franchises(
        self, admin_client, sample_collection, sample_collected_franchise
    ):
        """The core safety property of the optional tier: members survive."""
        fid = sample_collected_franchise.system_id
        assert admin_client.delete(
            f"/api/collection/{sample_collection.system_id}"
        ).status_code == 200

        response = admin_client.get(f"/api/franchise/{fid}")
        assert response.status_code == 200, "member franchise was deleted with cascade"
        assert response.json()["collection_id"] is None


class TestFranchiseCollectionFilter:
    def test_filter_returns_only_members(
        self, client, sample_collection, sample_collected_franchise, sample_franchise
    ):
        data = client.get(
            f"/api/franchise/?collection_id={sample_collection.system_id}"
        ).json()
        ids = [f["system_id"] for f in data]
        assert str(sample_collected_franchise.system_id) in ids
        assert str(sample_franchise.system_id) not in ids

    def test_unknown_collection_id_returns_empty(self, client, sample_franchise):
        assert client.get(f"/api/franchise/?collection_id={uuid.uuid4()}").json() == []

    def test_no_filter_returns_all_franchises(
        self, client, sample_collected_franchise, sample_franchise
    ):
        """The Franchise library must stay flat and complete."""
        ids = [f["system_id"] for f in client.get("/api/franchise/?limit=2000").json()]
        assert str(sample_collected_franchise.system_id) in ids
        assert str(sample_franchise.system_id) in ids
