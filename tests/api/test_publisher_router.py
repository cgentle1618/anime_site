"""The publisher router. Shaped after app/routers/studio.py."""

import uuid

from app import models


def test_create_and_list(admin_client, client):
    admin_client.post("/api/publisher/", json={"name_en": "Bandai Namco"})
    assert [p["name_en"] for p in client.get("/api/publisher/").json()] == [
        "Bandai Namco"
    ]


def test_creating_an_existing_publisher_returns_the_existing_row(admin_client):
    first = admin_client.post("/api/publisher/", json={"name_en": "Kadokawa"}).json()
    second = admin_client.post("/api/publisher/", json={"name_en": "Kadokawa"}).json()
    assert first["system_id"] == second["system_id"]


def test_a_nameless_publisher_is_rejected(admin_client):
    assert admin_client.post("/api/publisher/", json={}).status_code == 422


def test_listing_is_public_but_writing_is_not(client):
    assert client.get("/api/publisher/").status_code == 200
    assert client.post("/api/publisher/", json={"name_en": "X"}).status_code == 401


def test_detail_404s_for_an_unknown_id(client):
    assert client.get(f"/api/publisher/{uuid.uuid4()}").status_code == 404


def test_list_is_sorted_by_display_name(admin_client, client):
    for name in ("Zen Studios", "Annapurna", "Merge Games"):
        admin_client.post("/api/publisher/", json={"name_en": name})
    names = [p["display_name"] for p in client.get("/api/publisher/").json()]
    assert names == sorted(names, key=str.casefold)


def test_credit_count_reflects_credits(admin_client, db_session):
    created = admin_client.post("/api/publisher/", json={"name_en": "Devolver"}).json()
    db_session.add(
        models.MediaCredit(
            media_type="game",
            entry_id=uuid.uuid4(),
            role="publisher",
            publisher_id=created["system_id"],
        )
    )
    db_session.commit()
    detail = admin_client.get(f"/api/publisher/{created['system_id']}").json()
    assert detail["credit_count"] == 1


def test_delete_removes_the_publisher_and_its_logo(admin_client, monkeypatch):
    """
    Studio's delete path never calls delete_cover_image, so a deleted studio
    leaks its logo. Publisher must not inherit that gap.
    """
    from app.routers import publisher as publisher_router

    deleted = []
    monkeypatch.setattr(
        publisher_router,
        "delete_cover_image",
        lambda owner_type, sid: deleted.append((owner_type, sid)),
    )
    created = admin_client.post(
        "/api/publisher/", json={"name_en": "Doomed", "logo_file": "publisher/x.jpg"}
    ).json()
    assert (
        admin_client.delete(f"/api/publisher/{created['system_id']}").status_code == 200
    )
    assert deleted == [("publisher", created["system_id"])]


def test_merge_moves_credits_and_deletes_the_loser(admin_client, db_session):
    keep = admin_client.post("/api/publisher/", json={"name_en": "Keep"}).json()
    lose = admin_client.post("/api/publisher/", json={"name_en": "Lose"}).json()
    db_session.add(
        models.MediaCredit(
            media_type="game",
            entry_id=uuid.uuid4(),
            role="publisher",
            publisher_id=lose["system_id"],
        )
    )
    db_session.commit()

    result = admin_client.post(
        f"/api/publisher/{keep['system_id']}/merge",
        json={"source_id": lose["system_id"]},
    ).json()
    assert result["credits_moved"] == 1
    assert db_session.get(models.Publisher, uuid.UUID(lose["system_id"])) is None


def test_merging_a_publisher_into_itself_is_a_400(admin_client):
    created = admin_client.post("/api/publisher/", json={"name_en": "Solo"}).json()
    assert (
        admin_client.post(
            f"/api/publisher/{created['system_id']}/merge",
            json={"source_id": created["system_id"]},
        ).status_code
        == 400
    )
