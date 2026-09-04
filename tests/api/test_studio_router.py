"""The studio router."""

import uuid

from app import models


def test_create_and_list(admin_client, client):
    admin_client.post("/api/studio/", json={"name_en": "MAPPA"})
    assert [s["name_en"] for s in client.get("/api/studio/").json()] == ["MAPPA"]


def test_update_changes_the_rating(admin_client):
    created = admin_client.post(
        "/api/studio/", json={"name_en": "MAPPA"}
    ).json()
    r = admin_client.put(
        f"/api/studio/{created['system_id']}",
        json={"name_en": "MAPPA", "my_rating": "S"},
    )
    assert r.json()["my_rating"] == "S"


def test_renaming_a_studio_changes_every_entry_that_credits_it(
    admin_client, client, db_session
):
    created = admin_client.post(
        "/api/studio/", json={"name_en": "MAPPA"}
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
        f"/api/studio/{created['system_id']}", json={"name_en": "MAPPA Inc."}
    )
    from app.services.domain.credits import credit_names

    assert credit_names(db_session, "anime", entry_id, "studio") == ["MAPPA Inc."]


def test_delete_cascades_the_credits(admin_client, db_session):
    created = admin_client.post(
        "/api/studio/", json={"name_en": "MAPPA"}
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
    assert client.post("/api/studio/", json={"name_en": "X"}).status_code in (
        401,
        403,
    )


def test_create_rejects_a_studio_with_no_name(admin_client):
    assert admin_client.post("/api/studio/", json={"my_rating": "S"}).status_code == 422


def test_response_carries_the_display_name(admin_client):
    created = admin_client.post(
        "/api/studio/",
        json={"name_en": "Kyoto Animation", "name_alt": "KyoAni",
              "display_name_field": "alt"},
    ).json()
    assert created["display_name"] == "KyoAni"


def test_list_is_sorted_by_display_name(admin_client, client):
    admin_client.post("/api/studio/", json={"name_en": "WIT STUDIO"})
    admin_client.post("/api/studio/", json={"name_en": "MAPPA"})
    names = [s["display_name"] for s in client.get("/api/studio/").json()]
    assert names == ["MAPPA", "WIT STUDIO"]


def test_profile_columns_round_trip(admin_client):
    created = admin_client.post("/api/studio/", json={"name_en": "MAPPA"}).json()
    r = admin_client.put(
        f"/api/studio/{created['system_id']}",
        json={"name_en": "MAPPA", "country": "Japan", "founded_date": "2011-06",
              "website_url": "https://mappa.co.jp", "mal_id": 569},
    )
    assert r.json()["country"] == "Japan"
    assert r.json()["founded_date"] == "2011-06"
