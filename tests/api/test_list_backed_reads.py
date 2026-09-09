"""
Reads served from user_media_list.

Parametrised over nothing yet: anime is the only list-backed type until Task 9,
and these tests are what Task 9 turns green. They are written here so the
machinery lands red-first, as the project rule requires.
"""

import uuid

import pytest

from app import models
from app.services.domain.user_list import acting_user_id

# Applied per test, not to the module: four of the five below only pass once
# anime is list_backed (Task 9), but the last one passes today as well - an
# untouched entry has always read as "Might Watch" - and a strict xfail on a
# test that already passes is itself a failure. Marking it would hide the fact
# that it is a regression guard for behaviour Task 9 must NOT change.
needs_task_9 = pytest.mark.xfail(
    strict=True,
    reason="anime is not list_backed until Task 9; these are its acceptance tests",
)


@pytest.fixture
def db(db_session):
    return db_session


@pytest.fixture
def anime_with_list_row(db, admin_client, sample_franchise):
    """One anime plus the acting user's list row saying Completed / 9.5 / 28."""
    entry = models.Anime(
        system_id=uuid.uuid4(),
        franchise_id=sample_franchise.system_id,
        anime_name_en="List Backed Sentinel",
        airing_type="TV",
        ep_total=28,
    )
    db.add(entry)
    db.flush()
    user_id = acting_user_id(db, None)
    db.add(
        models.UserMediaList(
            system_id=uuid.uuid4(),
            user_id=user_id,
            media_id=entry.system_id,
            status="Completed",
            my_rating="9.5",
            ep_fin=28,
            my_watch_day="Friday",
        )
    )
    db.flush()
    return entry


@needs_task_9
def test_get_one_serves_the_personal_fields_from_the_list_row(
    admin_client, anime_with_list_row
):
    body = admin_client.get(f"/api/anime/{anime_with_list_row.system_id}").json()
    assert body["watching_status"] == "Completed"
    assert body["my_rating"] == "9.5"
    assert body["ep_fin"] == 28
    assert body["my_watch_day"] == "Friday"


@needs_task_9
def test_an_entry_with_no_list_row_reads_as_the_type_default(
    admin_client, db, sample_franchise
):
    entry = models.Anime(
        system_id=uuid.uuid4(),
        franchise_id=sample_franchise.system_id,
        anime_name_en="Untouched Sentinel",
        airing_type="TV",
    )
    db.add(entry)
    db.flush()
    body = admin_client.get(f"/api/anime/{entry.system_id}").json()
    assert body["watching_status"] == "Might Watch"
    assert body["my_rating"] is None
    assert body["ep_fin"] is None


@needs_task_9
def test_the_list_endpoint_serves_the_personal_fields_too(
    admin_client, anime_with_list_row
):
    rows = admin_client.get("/api/anime/?limit=2000").json()
    found = [r for r in rows if r["system_id"] == str(anime_with_list_row.system_id)]
    assert len(found) == 1
    assert found[0]["watching_status"] == "Completed"
    assert found[0]["my_rating"] == "9.5"


@needs_task_9
def test_a_status_filter_matches_through_the_joined_list_row(
    admin_client, db, sample_franchise, anime_with_list_row
):
    other = models.Anime(
        system_id=uuid.uuid4(),
        franchise_id=sample_franchise.system_id,
        anime_name_en="Watching Sentinel",
        airing_type="TV",
    )
    db.add(other)
    db.flush()
    db.add(
        models.UserMediaList(
            system_id=uuid.uuid4(),
            user_id=acting_user_id(db, None),
            media_id=other.system_id,
            status="Active Watching",
        )
    )
    db.flush()

    rows = admin_client.get("/api/anime/?watching_status=Completed&limit=2000").json()
    ids = {r["system_id"] for r in rows}
    assert str(anime_with_list_row.system_id) in ids
    assert str(other.system_id) not in ids


def test_a_status_filter_matching_the_default_finds_rowless_entries(
    admin_client, db, sample_franchise
):
    """An entry nobody has touched has no list row, and "Might Watch" is what
    it used to read as. The OUTER join plus a NULL branch is what keeps that
    true; an inner join would make the entry vanish from its own list page."""
    entry = models.Anime(
        system_id=uuid.uuid4(),
        franchise_id=sample_franchise.system_id,
        anime_name_en="Rowless Sentinel",
        airing_type="TV",
    )
    db.add(entry)
    db.flush()
    rows = admin_client.get("/api/anime/?watching_status=Might Watch&limit=2000").json()
    assert str(entry.system_id) in {r["system_id"] for r in rows}
