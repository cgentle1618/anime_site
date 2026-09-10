"""
GET /api/community/{media_id} - what the PUBLIC lists think of one entry.

Private lists are not counted, and the reason is not squeamishness: a total
that moved when a private list changed would let anyone read a private list one
bit at a time.
"""

import uuid

import pytest

from app import models
from app.services.security import get_password_hash


@pytest.fixture
def db(db_session):
    return db_session


def _member(db, username, public):
    role = db.query(models.Role).filter(models.Role.name == "user").one()
    u = models.User(
        id=uuid.uuid4(),
        username=username,
        hashed_password=get_password_hash("x"),
        role_id=role.system_id,
        list_is_public=public,
    )
    db.add(u)
    db.flush()
    return u


def _listed(db, user, media_id, status, rating):
    row = models.UserMediaList(
        system_id=uuid.uuid4(),
        user_id=user.id,
        media_id=media_id,
        status=status,
        my_rating=rating,
    )
    db.add(row)
    db.flush()
    return row


def test_an_entry_nobody_listed_reports_nothing(client, sample_anime):
    r = client.get(f"/api/community/{sample_anime.system_id}")
    assert r.status_code == 200
    body = r.json()
    assert body["statuses"] == []
    assert body["sample_size"] == 0
    assert body["average_rating"] is None


def test_public_lists_are_counted_per_status(db, client, sample_anime):
    _listed(db, _member(db, "a", True), sample_anime.system_id, "Completed", "S")
    _listed(db, _member(db, "b", True), sample_anime.system_id, "Completed", "A")
    _listed(db, _member(db, "c", True), sample_anime.system_id, "Watching", None)

    body = client.get(f"/api/community/{sample_anime.system_id}").json()
    counts = {s["status"]: s["count"] for s in body["statuses"]}
    assert counts == {"Completed": 2, "Watching": 1}
    assert body["list_count"] == 3


def test_private_lists_are_not_counted(db, client, sample_anime):
    _listed(db, _member(db, "seen", True), sample_anime.system_id, "Completed", "A")
    _listed(db, _member(db, "hidden", False), sample_anime.system_id, "Completed", "F")

    body = client.get(f"/api/community/{sample_anime.system_id}").json()
    assert body["list_count"] == 1
    assert body["sample_size"] == 1
    assert body["average_rating"] == "A"


def test_the_average_ignores_unrated_rows(db, client, sample_anime):
    _listed(db, _member(db, "a", True), sample_anime.system_id, "Completed", "S")
    _listed(db, _member(db, "b", True), sample_anime.system_id, "Watching", None)

    body = client.get(f"/api/community/{sample_anime.system_id}").json()
    assert body["list_count"] == 2
    assert body["sample_size"] == 1
    assert body["average_rating"] == "S"


def test_the_average_is_the_nearest_letter(db, client, sample_anime):
    # S=8 and A=6 average to 7, which is A+.
    _listed(db, _member(db, "a", True), sample_anime.system_id, "Completed", "S")
    _listed(db, _member(db, "b", True), sample_anime.system_id, "Completed", "A")

    body = client.get(f"/api/community/{sample_anime.system_id}").json()
    assert body["average_points"] == 7.0
    assert body["average_rating"] == "A+"


def test_an_unknown_media_id_reports_nothing_rather_than_erroring(client):
    r = client.get(f"/api/community/{uuid.uuid4()}")
    assert r.status_code == 200
    assert r.json()["list_count"] == 0
