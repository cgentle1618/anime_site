"""
Who may write a list row.

Three viewers, three answers, and the middle one is the whole point of the
`user` role: an anonymous visitor is refused, a signed-in member writes their
own row, and an admin - superuser - is refused too.

THE LAST ONE INVERTED ON 2026-09-12, deliberately. It used to assert that a
superuser "is never blocked", which was true and was the bug: the short-circuit
in Viewer.has() made `self.list` a privilege, so every personal row in the
first installation accumulated on the administrative account. `self.*` is
ownership, not privilege - an admin administers the site and does not keep a
library on it. Spec:
docs/superpowers/specs/2026-09-12-admin-holds-no-user-data.md.

The plan wrote this file against an `/api/me` router it believed Step 1 had
shipped. Step 1 did not: it kept every list write inside the per-type entry
endpoints, which sit behind Depends(get_current_admin). So the router this
gates is created by the same task, because a permission naming no code is the
inert grant app/services/rbac/permissions.py exists to forbid.
"""

import pytest

from app import models
from app.services.rbac.permissions import PERM_SELF_LIST
from app.services.rbac.seed import default_guest_permissions
from tests.api.test_visibility import make_viewer


@pytest.fixture
def db(db_session):
    return db_session


def _list_write(client, media_id):
    """The list-write call. One place, so this file has one thing to fix if
    that route's shape ever changes."""
    return client.put(
        f"/api/me/list/{media_id}",
        json={"watching_status": "Watching", "my_rating": "A"},
    )


def test_an_anonymous_visitor_cannot_write_a_list_row(client, sample_anime):
    r = _list_write(client, sample_anime.system_id)
    assert r.status_code == 401


def test_a_viewer_without_self_list_cannot_write_one(db, client, sample_anime):
    make_viewer(db, client, "readonly-lister", default_guest_permissions())
    r = _list_write(client, sample_anime.system_id)
    assert r.status_code == 401


def test_a_viewer_holding_self_list_can(db, client, sample_anime):
    make_viewer(
        db, client, "member", default_guest_permissions() | {PERM_SELF_LIST}
    )
    r = _list_write(client, sample_anime.system_id)
    assert r.status_code in (200, 201)
    assert r.json()["watching_status"] == "Watching"
    assert r.json()["my_rating"] == "A"


def test_an_admin_is_blocked(admin_client, sample_anime):
    """
    A superuser holds every OTHER permission implicitly and this one not at
    all. 401, the same answer the route gives a signed-in account that was
    never granted it - there is no separate "you are an admin" refusal, which
    is the point of expressing the rule in has() rather than in the router.
    """
    r = _list_write(admin_client, sample_anime.system_id)
    assert r.status_code == 401


def test_the_admin_still_holds_every_other_permission(admin_client):
    """
    The mirror, so a green above proves the `self` carve-out and not a broken
    superuser short-circuit. A superuser reaches the authorization pages that
    no role grants it explicitly.
    """
    assert admin_client.get("/api/roles/").status_code == 200


def test_a_superuser_is_refused_the_personal_endpoints_too(admin_client):
    """
    The other two prefixes that used to ask only "is anybody signed in".
    Without these the rule leaks: an admin could still queue a plan-next
    entry and rate a season while being unable to rate an entry.
    """
    assert admin_client.get("/api/plan-next/").status_code == 401
    assert admin_client.get("/api/seasonal/").status_code == 401


def test_the_row_written_belongs_to_the_caller(db, client, sample_anime):
    """
    The whole point of the gate: a member writes their OWN row. Nobody can
    address someone else's, because the route never takes a user id.
    """
    make_viewer(
        db, client, "owner-check", default_guest_permissions() | {PERM_SELF_LIST}
    )
    me = db.query(models.User).filter(models.User.username == "owner-check").one()

    def rows_for(user_id):
        return (
            db.query(models.UserMediaList)
            .filter(
                models.UserMediaList.media_id == sample_anime.system_id,
                models.UserMediaList.user_id == user_id,
            )
            .all()
        )

    # The fixture already gave the admin a row for this entry, so the check is
    # not "one row exists" but "the write went to mine and left theirs alone".
    others_before = {
        row.system_id: row.status
        for row in db.query(models.UserMediaList)
        .filter(
            models.UserMediaList.media_id == sample_anime.system_id,
            models.UserMediaList.user_id != me.id,
        )
        .all()
    }
    assert rows_for(me.id) == []

    _list_write(client, sample_anime.system_id)
    db.expire_all()

    mine = rows_for(me.id)
    assert len(mine) == 1
    assert mine[0].status == "Watching"
    assert mine[0].my_rating == "A"

    others_after = {
        row.system_id: row.status
        for row in db.query(models.UserMediaList)
        .filter(
            models.UserMediaList.media_id == sample_anime.system_id,
            models.UserMediaList.user_id != me.id,
        )
        .all()
    }
    assert others_after == others_before


def test_reading_back_an_untouched_entry_gives_the_type_default(
    db, client, sample_anime
):
    make_viewer(
        db, client, "reader", default_guest_permissions() | {PERM_SELF_LIST}
    )
    r = client.get(f"/api/me/list/{sample_anime.system_id}")
    assert r.status_code == 200
    assert r.json()["watching_status"] == "Might Watch"
    assert r.json()["my_rating"] is None


def test_an_unknown_media_id_is_404(db, client):
    import uuid

    make_viewer(
        db, client, "missing", default_guest_permissions() | {PERM_SELF_LIST}
    )
    r = client.get(f"/api/me/list/{uuid.uuid4()}")
    assert r.status_code == 404
