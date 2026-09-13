"""
GET /api/community/{media_id} - what the PUBLIC lists think of one entry.

Private lists are not counted, and the reason is not squeamishness: a total
that moved when a private list changed would let anyone read a private list one
bit at a time.
"""

import uuid

import pytest

from app import models
from app.services.rbac.permissions import media_type_perm
from app.services.rbac.seed import default_guest_permissions
from app.services.security import get_password_hash
from tests.api.conftest import make_viewer


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


def test_an_unknown_media_id_is_a_404(client):
    """
    Changed deliberately: this used to answer 200 with an empty aggregate.

    It cannot any more, because a hidden entry now 404s. If an unknown id kept
    answering 200 the status code would BE the existence oracle the gate exists
    to remove - 404 would mean "real, and you may not see it" and 200 would mean
    "no such entry". The two cases have to agree, so both are 404.
    """
    r = client.get(f"/api/community/{uuid.uuid4()}")
    assert r.status_code == 404


# ---------------------------------------------------------------------------
# The gate.
#
# Every test below pairs a refusal with its MIRROR on the same fixture. A
# refusal test alone proves nothing here: entry_visible short-circuits on
# `if not hidden: return True`, so with media_content_label empty - which is
# what a fresh database gives you - a "hidden entry is refused" assertion
# passes without the gate ever running, and would keep passing through the
# change that removes it. The mirror is what proves the refusal came from the
# gate rather than from an empty set.
# ---------------------------------------------------------------------------


def test_a_labelled_entry_is_indistinguishable_from_missing(client, hidden_anime):
    """The label axis refuses, and in the same words as a missing entry."""
    unknown = client.get(f"/api/community/{uuid.uuid4()}")
    hidden = client.get(f"/api/community/{hidden_anime.system_id}")

    assert hidden.status_code == 404
    assert hidden.json() == unknown.json()


def test_a_viewer_holding_the_label_gets_the_aggregate(
    db, client, hidden_anime
):
    """
    The mirror of the test above, on the SAME fixture.

    Without this, the refusal above could be an artifact of an empty label set
    rather than the gate doing its job.
    """
    make_viewer(
        db,
        client,
        "trusted",
        default_guest_permissions(),
        label_keys=("nsfw",),
    )
    r = client.get(f"/api/community/{hidden_anime.system_id}")
    assert r.status_code == 200
    assert r.json()["media_id"] == str(hidden_anime.system_id)


def test_a_labelled_entrys_public_counts_are_not_disclosed(
    db, client, hidden_anime
):
    """
    The disclosure this gate exists to stop: a hidden entry that real public
    lists have rated must not hand its histogram to an anonymous caller.
    """
    _listed(db, _member(db, "pub1", True), hidden_anime.system_id, "Completed", "S")
    _listed(db, _member(db, "pub2", True), hidden_anime.system_id, "Watching", "A")

    r = client.get(f"/api/community/{hidden_anime.system_id}")
    assert r.status_code == 404
    assert "Completed" not in r.text
    assert "Watching" not in r.text


def test_a_viewer_lacking_the_media_type_is_refused(db, client, sample_anime):
    """The TYPE axis, independent of labels: no media_type.anime, no aggregate."""
    make_viewer(
        db,
        client,
        "no-anime",
        default_guest_permissions() - {media_type_perm("anime")},
    )
    assert client.get(f"/api/community/{sample_anime.system_id}").status_code == 404


def test_a_viewer_holding_the_media_type_is_not(db, client, sample_anime):
    """The mirror, on the same entry - so the 404 above is the gate, not the id."""
    make_viewer(db, client, "yes-anime", default_guest_permissions())
    assert client.get(f"/api/community/{sample_anime.system_id}").status_code == 200
