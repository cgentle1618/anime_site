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


def test_using_an_unscoped_value_does_not_narrow_it(admin_client, client, db_session):
    """
    Ruling R27, the whole point of removing the derive-on-save.

    Add a value with no scopes (offered everywhere), assign it to ONE tv-show,
    and it must still be offered to cartoon. It used to acquire scope=tv-show
    on that save and then vanish from every other dropdown, with no warning and
    no way for an admin to put it back.
    """
    from app.services.domain.credits import replace_tags

    admin_client.post(
        "/api/options/",
        json={"category": "Official Source", "value": "Disney+", "scopes": []},
    )
    show = models.TVShows(tv_name_cn="A")
    db_session.add(show)
    db_session.commit()
    replace_tags(db_session, "tv-show", show.system_id, "source_official", ["Disney+"])
    db_session.commit()

    offered = {
        o["value"]
        for o in client.get("/api/options/Official Source?scope=cartoon").json()
    }
    assert "Disney+" in offered

    option = (
        db_session.query(models.SystemOption)
        .filter_by(category="Official Source", value="Disney+")
        .one()
    )
    assert option.scopes == [], "a save wrote a scope row it had no business writing"


def test_an_explicit_scope_still_narrows(admin_client, client):
    """Scoping remains a real, admin-chosen restriction."""
    admin_client.post(
        "/api/options/",
        json={
            "category": "Official Source",
            "value": "Bahamut",
            "scopes": ["anime"],
        },
    )
    anime_offered = {
        o["value"] for o in client.get("/api/options/Official Source?scope=anime").json()
    }
    cartoon_offered = {
        o["value"]
        for o in client.get("/api/options/Official Source?scope=cartoon").json()
    }
    assert "Bahamut" in anime_offered
    assert "Bahamut" not in cartoon_offered


def test_an_unknown_scope_is_rejected(admin_client):
    """A typo'd scope would hide the value from every dropdown at once."""
    r = admin_client.post(
        "/api/options/",
        json={"category": "Genre Main", "value": "Action", "scopes": ["anime_movie"]},
    )
    assert r.status_code == 422


def test_scopes_are_editable_after_creation(admin_client, client):
    """The repair path the Options form now exposes."""
    created = admin_client.post(
        "/api/options/",
        json={"category": "Genre Main", "value": "Mecha", "scopes": ["anime"]},
    ).json()
    updated = admin_client.put(
        f"/api/options/{created['system_id']}",
        json={"category": "Genre Main", "value": "Mecha", "scopes": []},
    )
    assert updated.status_code == 200
    assert updated.json()["scopes"] == []
    offered = {
        o["value"] for o in client.get("/api/options/Genre Main?scope=comic").json()
    }
    assert "Mecha" in offered
