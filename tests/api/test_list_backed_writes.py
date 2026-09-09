"""
Writes routed into user_media_list.

Marked xfail until Task 9 flips `anime` to list_backed; Task 9 removes the
marker. See tests/api/test_list_backed_reads.py for the read half.
"""

import uuid

import pytest

from app import models
from app.services.domain.user_list import acting_user_id

# Applied per test, not to the module. Six of the seven below only pass once
# anime is list_backed (Task 9), but test_the_catalogue_columns_still_land_on_
# the_detail_table passes today too - it asserts what must NOT change - and a
# strict xfail on a test that already passes is itself a failure.
needs_task_9 = pytest.mark.xfail(
    strict=True,
    reason="anime is not list_backed until Task 9; these are its acceptance tests",
)


@pytest.fixture
def db(db_session):
    return db_session


def _list_row(db, media_id):
    return (
        db.query(models.UserMediaList)
        .filter(models.UserMediaList.media_id == media_id)
        .one_or_none()
    )


@needs_task_9
def test_create_writes_the_personal_fields_to_a_list_row(admin_client, db):
    response = admin_client.post(
        "/api/anime/",
        json={
            "anime_name_en": "Created Sentinel",
            "airing_type": "TV",
            "ep_total": 12,
            "watching_status": "Active Watching",
            "my_rating": "8",
            "ep_fin": 6,
        },
    )
    assert response.status_code == 201, response.text
    body = response.json()
    assert body["watching_status"] == "Active Watching"
    assert body["my_rating"] == "8"
    assert body["ep_fin"] == 6

    row = _list_row(db, uuid.UUID(body["system_id"]))
    assert row is not None
    assert row.status == "Active Watching"
    assert row.my_rating == "8"
    assert row.ep_fin == 6
    assert row.user_id == acting_user_id(db, None)


@needs_task_9
def test_create_with_no_personal_fields_still_makes_a_default_row(admin_client, db):
    response = admin_client.post(
        "/api/anime/", json={"anime_name_en": "Bare Sentinel", "airing_type": "TV"}
    )
    assert response.status_code == 201, response.text
    row = _list_row(db, uuid.UUID(response.json()["system_id"]))
    assert row is not None
    assert row.status == "Might Watch"


def test_the_catalogue_columns_still_land_on_the_detail_table(admin_client, db):
    response = admin_client.post(
        "/api/anime/",
        json={
            "anime_name_en": "Split Sentinel",
            "airing_type": "TV",
            "ep_total": 24,
            "my_rating": "7",
        },
    )
    entry = db.get(models.Anime, uuid.UUID(response.json()["system_id"]))
    assert entry.ep_total == 24
    assert entry.anime_name_en == "Split Sentinel"


@needs_task_9
def test_patch_updates_the_list_row_not_the_entry(admin_client, db):
    created = admin_client.post(
        "/api/anime/", json={"anime_name_en": "Patched Sentinel", "airing_type": "TV"}
    ).json()
    response = admin_client.patch(
        f"/api/anime/{created['system_id']}", json={"my_rating": "6", "ep_fin": 3}
    )
    assert response.status_code == 200, response.text
    assert response.json()["my_rating"] == "6"

    row = _list_row(db, uuid.UUID(created["system_id"]))
    assert row.my_rating == "6"
    assert row.ep_fin == 3


@needs_task_9
def test_put_updates_the_list_row(admin_client, db):
    created = admin_client.post(
        "/api/anime/", json={"anime_name_en": "Put Sentinel", "airing_type": "TV"}
    ).json()
    response = admin_client.put(
        f"/api/anime/{created['system_id']}",
        json={
            "anime_name_en": "Put Sentinel",
            "airing_type": "TV",
            "watching_status": "Completed",
            "my_rating": "10",
        },
    )
    assert response.status_code == 200, response.text
    row = _list_row(db, uuid.UUID(created["system_id"]))
    assert row.status == "Completed"
    assert row.my_rating == "10"


@needs_task_9
def test_reaching_completed_stamps_completed_at_on_the_list_row(admin_client, db):
    created = admin_client.post(
        "/api/anime/", json={"anime_name_en": "Stamp Sentinel", "airing_type": "TV"}
    ).json()
    admin_client.patch(
        f"/api/anime/{created['system_id']}", json={"watching_status": "Completed"}
    )
    row = _list_row(db, uuid.UUID(created["system_id"]))
    assert row.status == "Completed"
    assert row.completed_at is not None


@needs_task_9
def test_completed_at_is_stamped_once_and_not_refreshed(admin_client, db):
    created = admin_client.post(
        "/api/anime/", json={"anime_name_en": "Once Sentinel", "airing_type": "TV"}
    ).json()
    admin_client.patch(
        f"/api/anime/{created['system_id']}", json={"watching_status": "Completed"}
    )
    first = _list_row(db, uuid.UUID(created["system_id"])).completed_at
    admin_client.patch(
        f"/api/anime/{created['system_id']}", json={"watching_status": "Completed"}
    )
    assert _list_row(db, uuid.UUID(created["system_id"])).completed_at == first
