"""The reworked options router."""

from app import models


def test_create_returns_the_new_uuid(admin_client):
    r = admin_client.post(
        "/api/options/", json={"category": "Genre Main", "value": "Action"}
    )
    assert r.status_code == 200
    assert r.json()["system_id"]


def test_create_rejects_an_exact_duplicate(admin_client):
    body = {"category": "Genre Main", "value": "Action"}
    admin_client.post("/api/options/", json=body)
    assert admin_client.post("/api/options/", json=body).status_code == 400


def test_create_records_scopes(admin_client):
    r = admin_client.post(
        "/api/options/",
        json={
            "category": "Official Source",
            "value": "Netflix",
            "scopes": ["tv-show", "cartoon"],
        },
    )
    assert sorted(r.json()["scopes"]) == ["cartoon", "tv-show"]


def test_reading_a_category_filters_by_scope(client, admin_client):
    admin_client.post(
        "/api/options/",
        json={"category": "Official Source", "value": "Netflix", "scopes": ["tv-show"]},
    )
    admin_client.post(
        "/api/options/",
        json={"category": "Official Source", "value": "Disney+", "scopes": ["cartoon"]},
    )
    values = [
        o["value"]
        for o in client.get("/api/options/Official Source?scope=tv-show").json()
    ]
    assert values == ["Netflix"]


def test_an_unscoped_value_is_offered_everywhere(client, admin_client):
    admin_client.post(
        "/api/options/", json={"category": "Official Source", "value": "官網"}
    )
    values = [
        o["value"]
        for o in client.get("/api/options/Official Source?scope=cartoon").json()
    ]
    assert "官網" in values


def test_results_come_back_in_sort_order_then_value(client, admin_client):
    admin_client.post(
        "/api/options/",
        json={"category": "Genre Main", "value": "Zombie", "sort_order": 1},
    )
    admin_client.post(
        "/api/options/",
        json={"category": "Genre Main", "value": "Action", "sort_order": 2},
    )
    values = [o["value"] for o in client.get("/api/options/Genre Main").json()]
    assert values == ["Zombie", "Action"]


def test_update_replaces_the_scope_set(admin_client):
    created = admin_client.post(
        "/api/options/",
        json={"category": "Official Source", "value": "Netflix", "scopes": ["tv-show"]},
    ).json()
    r = admin_client.put(
        f"/api/options/{created['system_id']}",
        json={
            "category": "Official Source",
            "value": "Netflix",
            "scopes": ["cartoon"],
        },
    )
    assert r.json()["scopes"] == ["cartoon"]


def test_delete_cascades_the_tags(admin_client, db_session):
    created = admin_client.post(
        "/api/options/", json={"category": "Genre Main", "value": "Action"}
    ).json()
    import uuid

    db_session.add(
        models.MediaTag(
            media_type="anime",
            entry_id=uuid.uuid4(),
            field="genre_main",
            option_id=created["system_id"],
        )
    )
    db_session.commit()

    assert admin_client.delete(f"/api/options/{created['system_id']}").status_code == 200
    assert db_session.query(models.MediaTag).count() == 0


def test_writes_require_admin(client):
    r = client.post("/api/options/", json={"category": "Genre Main", "value": "X"})
    assert r.status_code in (401, 403)
