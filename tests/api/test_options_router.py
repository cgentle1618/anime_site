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


def test_update_keeps_a_scope_the_option_already_had(admin_client):
    """
    Editing a value without touching its scopes must not fail.

    `db_option.scopes = [...]` left the old rows to delete-orphan, but within
    one flush SQLAlchemy emits this table's INSERTs before its DELETEs, so
    re-saving a scope the option already had inserted a duplicate
    (option_id, scope) while the old row was still there and tripped
    uq_system_option_scope with a 500.
    """
    created = admin_client.post(
        "/api/options/",
        json={"category": "Quality", "value": "品質高", "scopes": ["anime"]},
    ).json()

    r = admin_client.put(
        f"/api/options/{created['system_id']}",
        json={"category": "Quality", "value": "品質很高", "scopes": ["anime"]},
    )
    assert r.status_code == 200, r.text
    assert r.json()["value"] == "品質很高"
    assert r.json()["scopes"] == ["anime"]


def test_update_can_add_and_drop_scopes_at_once(admin_client, db_session):
    """A kept scope, a new one and a dropped one in a single save."""
    created = admin_client.post(
        "/api/options/",
        json={
            "category": "Official Source",
            "value": "Netflix",
            "scopes": ["tv-show", "cartoon"],
        },
    ).json()

    r = admin_client.put(
        f"/api/options/{created['system_id']}",
        json={
            "category": "Official Source",
            "value": "Netflix",
            "scopes": ["tv-show", "movie"],
        },
    )
    assert r.status_code == 200, r.text
    assert sorted(r.json()["scopes"]) == ["movie", "tv-show"]
    # No orphan left behind for the dropped scope.
    rows = (
        db_session.query(models.SystemOptionScope)
        .filter_by(option_id=created["system_id"])
        .all()
    )
    assert sorted(row.scope for row in rows) == ["movie", "tv-show"]


def test_update_can_clear_every_scope(admin_client):
    """Empty scopes means offered everywhere, and must be reachable."""
    created = admin_client.post(
        "/api/options/",
        json={"category": "Quality", "value": "作畫崩壞", "scopes": ["anime"]},
    ).json()

    r = admin_client.put(
        f"/api/options/{created['system_id']}",
        json={"category": "Quality", "value": "作畫崩壞", "scopes": []},
    )
    assert r.status_code == 200, r.text
    assert r.json()["scopes"] == []


def test_create_records_usages(admin_client):
    r = admin_client.post(
        "/api/options/",
        json={
            "category": "Platform",
            "value": "Fox",
            "scopes": ["tv-show"],
            "usages": ["origin"],
        },
    )
    assert r.status_code == 200
    assert r.json()["usages"] == ["origin"]


def test_an_unknown_usage_is_rejected(admin_client):
    r = admin_client.post(
        "/api/options/",
        json={"category": "Platform", "value": "Bad", "usages": ["streaming"]},
    )
    assert r.status_code == 422


def test_reading_a_category_filters_by_usage(client, admin_client):
    admin_client.post(
        "/api/options/",
        json={"category": "Platform", "value": "ABC", "usages": ["origin"]},
    )
    admin_client.post(
        "/api/options/", json={"category": "Platform", "value": "Netflix"}
    )

    values = [o["value"] for o in client.get("/api/options/Platform?usage=watch").json()]
    assert "Netflix" in values
    assert "ABC" not in values


def test_an_unrestricted_value_serves_every_usage(client, admin_client):
    admin_client.post(
        "/api/options/", json={"category": "Platform", "value": "Prime Video"}
    )
    for usage in ("watch", "origin"):
        values = [
            o["value"] for o in client.get(f"/api/options/Platform?usage={usage}").json()
        ]
        assert "Prime Video" in values


def test_update_replaces_the_usage_set(admin_client):
    created = admin_client.post(
        "/api/options/",
        json={"category": "Platform", "value": "HBO Max", "usages": ["origin"]},
    ).json()

    r = admin_client.put(
        f"/api/options/{created['system_id']}",
        json={
            "category": "Platform",
            "value": "HBO Max",
            "sort_order": 0,
            "remark": None,
            "scopes": [],
            "usages": [],
        },
    )
    assert r.status_code == 200
    assert r.json()["usages"] == []
