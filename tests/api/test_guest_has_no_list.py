"""
A logged-out visitor has no list, and is shown none.

Until now `acting_user_id` fell back to the lowest-username admin when it could
not resolve a viewer, so a stranger read that account's statuses, ratings and
progress as though they were facts about the work. They are facts about a
person. A guest now resolves to nobody and the personal fields come back null.

The fallback had a second, legitimate job that survives under its own name:
a restore or a pipeline has to file its rows under *somebody*, which is a
data-ownership question and not a visibility one. That is
`installation_owner_id`, and the tests at the bottom pin the distinction.
"""

import uuid

import pytest

from app import models
from app.services.domain.user_list import acting_user_id, installation_owner_id


@pytest.fixture
def db(db_session):
    return db_session


@pytest.fixture
def rated_anime(db, admin_user, sample_franchise):
    """An anime the admin has Completed and rated."""
    entry = models.Anime(
        system_id=uuid.uuid4(),
        franchise_id=sample_franchise.system_id,
        anime_name_en="Guest Fallback Sentinel",
        airing_type="TV",
        ep_total=26,
    )
    db.add(entry)
    db.flush()
    db.add(
        models.UserMediaList(
            system_id=uuid.uuid4(),
            user_id=admin_user.id,
            media_id=entry.system_id,
            status="Completed",
            my_rating="S",
            ep_fin=26,
        )
    )
    db.commit()
    return entry


# --- the read path --------------------------------------------------------


def test_a_guest_sees_no_status_on_the_detail_page(client, rated_anime):
    r = client.get(f"/api/anime/{rated_anime.system_id}")
    assert r.status_code == 200
    body = r.json()
    assert body["watching_status"] is None
    assert body["my_rating"] is None


def test_a_guest_sees_no_status_in_the_library(client, rated_anime):
    r = client.get("/api/anime/")
    assert r.status_code == 200
    row = next(
        e for e in r.json() if e["system_id"] == str(rated_anime.system_id)
    )
    assert row["watching_status"] is None
    assert row["my_rating"] is None


def test_a_guest_does_not_see_the_default_status_either(client, rated_anime):
    """
    The subtle half. `attach_list_fields` gives an entry with no row the type's
    DEFAULT_STATUS, which is right for a signed-in user who has not touched it
    and wrong for a stranger: "Might Watch" is a claim about somebody, and
    there is nobody here to make it about.
    """
    body = client.get(f"/api/anime/{rated_anime.system_id}").json()
    assert body["watching_status"] != "Might Watch"


def test_the_owner_still_sees_their_own_list(admin_client, rated_anime):
    """The change is invisible to anybody signed in."""
    body = admin_client.get(f"/api/anime/{rated_anime.system_id}").json()
    assert body["watching_status"] == "Completed"
    assert body["my_rating"] == "S"


def test_a_signed_in_user_with_no_row_still_gets_the_default(
    user_client, rated_anime
):
    """
    A `user`-role account that has never touched this entry is a person who
    has not started it - which is exactly what the default status says.
    """
    body = user_client.get(f"/api/anime/{rated_anime.system_id}").json()
    assert body["watching_status"] == "Might Watch"
    assert body["my_rating"] is None


# --- the resolver ---------------------------------------------------------


def test_acting_user_id_no_longer_falls_back(db):
    """A viewer that resolves to nobody stays nobody."""
    assert acting_user_id(db, None) is None

    class _Guest:
        user_id = None

    assert acting_user_id(db, _Guest()) is None


def test_acting_user_id_still_answers_for_a_real_viewer(db, admin_user):
    class _Viewer:
        user_id = admin_user.id

    assert acting_user_id(db, _Viewer()) == admin_user.id


# --- the owner rule that survives ----------------------------------------


def test_installation_owner_id_names_the_admin(db, admin_user):
    """
    Not a visibility rule. A Sheets restore and the Calculate pipeline both
    have to file rows under somebody, and neither is answering "what may this
    visitor see?" - which is why the fallback moved here rather than being
    deleted outright.
    """
    assert installation_owner_id(db) == admin_user.id


def test_the_two_are_not_the_same_function(db):
    """
    The whole point of the split: the pipeline rule answers, the visibility
    rule does not.
    """
    assert acting_user_id(db, None) is None
    assert installation_owner_id(db) is not None


# --- the bug the split uncovered ------------------------------------------


def test_complete_writes_to_the_caller_not_the_first_admin(
    db, admin_client, admin_user, sample_franchise
):
    """
    `POST /{type}/{id}/complete` called acting_user_id(db, None) - passing no
    viewer at all - so it resolved through the fallback to the LOWEST-USERNAME
    admin rather than to whoever pressed the button. Its own comment said the
    row "lands on the acting user's row"; it did not. Invisible with one admin,
    and a silent write to somebody else's list with two.
    """
    other = models.User(
        id=uuid.uuid4(),
        username="aaa_earlier_admin",  # sorts before the acting admin
        hashed_password="x",
        role_id=admin_user.role_id,
    )
    db.add(other)

    entry = models.Anime(
        system_id=uuid.uuid4(),
        franchise_id=sample_franchise.system_id,
        anime_name_en="Complete Attribution Sentinel",
        airing_type="TV",
        ep_total=12,
    )
    db.add(entry)
    db.commit()

    r = admin_client.post(f"/api/anime/{entry.system_id}/complete")
    assert r.status_code == 200

    rows = (
        db.query(models.UserMediaList)
        .filter(models.UserMediaList.media_id == entry.system_id)
        .all()
    )
    assert [row.user_id for row in rows] == [admin_user.id]


# --- the leak the split uncovered -----------------------------------------


def test_a_guest_filtering_by_status_matches_nothing(
    db, client, rated_anime, admin_user
):
    """
    `join_list` returns the query untouched when there is no acting user, so a
    filter naming a personal column used to become an implicit CROSS JOIN
    against user_media_list - matching entries that ANY account had marked,
    not the caller's. With no list of your own, a filter over it selects
    nothing; it must not quietly select everyone's.
    """
    r = client.get("/api/anime/", params={"watching_status": "Completed"})
    assert r.status_code == 200
    assert r.json() == []


def test_the_same_filter_still_works_for_its_owner(admin_client, rated_anime):
    r = admin_client.get("/api/anime/", params={"watching_status": "Completed"})
    assert r.status_code == 200
    assert [e["system_id"] for e in r.json()] == [str(rated_anime.system_id)]
