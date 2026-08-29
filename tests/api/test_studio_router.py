"""The studio router."""

import uuid

from app import models


def test_create_and_list(admin_client, client):
    admin_client.post("/api/studio/", json={"name_native": "MAPPA"})
    assert [s["name_native"] for s in client.get("/api/studio/").json()] == ["MAPPA"]


def test_list_is_sorted_by_native_name(admin_client, client):
    admin_client.post("/api/studio/", json={"name_native": "WIT STUDIO"})
    admin_client.post("/api/studio/", json={"name_native": "MAPPA"})
    assert [s["name_native"] for s in client.get("/api/studio/").json()] == [
        "MAPPA",
        "WIT STUDIO",
    ]


def test_update_changes_the_rating(admin_client):
    created = admin_client.post(
        "/api/studio/", json={"name_native": "MAPPA"}
    ).json()
    r = admin_client.put(
        f"/api/studio/{created['system_id']}",
        json={"name_native": "MAPPA", "my_rating": "S"},
    )
    assert r.json()["my_rating"] == "S"


def test_renaming_a_studio_changes_every_entry_that_credits_it(
    admin_client, client, db_session
):
    created = admin_client.post(
        "/api/studio/", json={"name_native": "MAPPA"}
    ).json()
    entry_id = uuid.uuid4()
    db_session.add(
        models.MediaCredit(
            media_type="anime",
            entry_id=entry_id,
            role="studio",
            studio_id=created["system_id"],
        )
    )
    db_session.commit()

    admin_client.put(
        f"/api/studio/{created['system_id']}", json={"name_native": "MAPPA Inc."}
    )
    from app.services.domain.credits import credit_names

    assert credit_names(db_session, "anime", entry_id, "studio") == ["MAPPA Inc."]


def test_delete_cascades_the_credits(admin_client, db_session):
    created = admin_client.post(
        "/api/studio/", json={"name_native": "MAPPA"}
    ).json()
    db_session.add(
        models.MediaCredit(
            media_type="anime",
            entry_id=uuid.uuid4(),
            role="studio",
            studio_id=created["system_id"],
        )
    )
    db_session.commit()

    admin_client.delete(f"/api/studio/{created['system_id']}")
    assert db_session.query(models.MediaCredit).count() == 0


def test_writes_require_admin(client):
    assert client.post("/api/studio/", json={"name_native": "X"}).status_code in (
        401,
        403,
    )
