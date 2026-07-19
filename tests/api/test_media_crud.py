"""
CRUD smoke tests for the five "regular" media routers (movie, tv_show, cartoon,
manga, novel). These capture the behavior the router factory must preserve.

Entries are created with only a name (no imdb/mal link), so the create/update
write hook (execute_replace_single_*) is a no-op and no network call is made.
"""
import uuid
import pytest

import app.models as models

# (route, name_field, status_field, model)
CASES = [
    ("movies", "movie_name_en", "watching_status", models.Movies),
    ("tv-shows", "tv_name_en", "watching_status", models.TVShows),
    ("cartoon", "cartoon_name_en", "watching_status", models.Cartoon),
    ("manga", "manga_name_en", "reading_status", models.Manga),
    ("novel", "novel_name_en", "reading_status", models.Novel),
]
IDS = [c[0] for c in CASES]


@pytest.mark.parametrize("route,name_field,status_field,model", CASES, ids=IDS)
class TestMediaCrud:
    def _create(self, admin_client, route, name_field, name="Smoke Test"):
        return admin_client.post(f"/api/{route}/", json={name_field: name})

    def test_create_returns_201_and_echoes_name(self, admin_client, route, name_field, status_field, model):
        r = self._create(admin_client, route, name_field)
        assert r.status_code == 201, r.text
        assert r.json()[name_field] == "Smoke Test"

    def test_get_by_id(self, admin_client, route, name_field, status_field, model):
        created = self._create(admin_client, route, name_field).json()
        r = admin_client.get(f"/api/{route}/{created['system_id']}")
        assert r.status_code == 200
        assert r.json()["system_id"] == created["system_id"]

    def test_get_nonexistent_returns_404(self, admin_client, route, name_field, status_field, model):
        r = admin_client.get(f"/api/{route}/{uuid.uuid4()}")
        assert r.status_code == 404

    def test_list_includes_created(self, admin_client, route, name_field, status_field, model):
        created = self._create(admin_client, route, name_field).json()
        r = admin_client.get(f"/api/{route}/")
        assert r.status_code == 200
        assert any(e["system_id"] == created["system_id"] for e in r.json())

    def test_patch_updates_field(self, admin_client, route, name_field, status_field, model):
        created = self._create(admin_client, route, name_field).json()
        r = admin_client.patch(f"/api/{route}/{created['system_id']}", json={name_field: "Renamed"})
        assert r.status_code == 200
        assert r.json()[name_field] == "Renamed"

    def test_complete_sets_status(self, admin_client, route, name_field, status_field, model):
        created = self._create(admin_client, route, name_field).json()
        r = admin_client.post(f"/api/{route}/{created['system_id']}/complete")
        assert r.status_code == 200
        assert r.json()[status_field] == "Completed"
        assert r.json()["completed_at"] is not None

    def test_delete_removes_and_logs(self, admin_client, db_session, route, name_field, status_field, model):
        created = self._create(admin_client, route, name_field).json()
        r = admin_client.delete(f"/api/{route}/{created['system_id']}")
        assert r.status_code == 200
        assert r.json()["status"] == "success"
        assert admin_client.get(f"/api/{route}/{created['system_id']}").status_code == 404
        # The db_session transaction is isolated per test, so exactly one
        # deleted_record should have been staged by this delete.
        assert db_session.query(models.DeletedRecord).count() == 1

    def test_guest_cannot_create(self, client, route, name_field, status_field, model):
        r = client.post(f"/api/{route}/", json={name_field: "Nope"})
        assert r.status_code == 401

    def test_guest_cannot_delete(self, admin_client, client, route, name_field, status_field, model):
        created = self._create(admin_client, route, name_field).json()
        r = client.delete(f"/api/{route}/{created['system_id']}")
        assert r.status_code == 401
