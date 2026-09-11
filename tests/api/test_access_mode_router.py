"""/api/access-modes - editing the object axis.

Shaped on roles.py route for route, with two deliberate differences:

  - `/catalog` returns two labelled groups (Content Labels, Field Groups)
    rather than permission families, and lists EVERY content label - including
    ones no mode carries, because the page has to be able to warn about them.
  - The guest default MOVES rather than raising. A partial unique index
    permits one flagged mode; letting the index enforce that would surface as
    a 500, so the write clears the old flag in the same transaction.
"""

import uuid

from app import models
from app.services.rbac.field_groups import FIELD_GROUP_KEYS
from app.services.rbac.seed_modes import (
    MODE_NORMAL,
    MODE_SAFE,
    MODE_UNRESTRICTED,
)

MODES = "/api/access-modes/"


# ---------------------------------------------------------------------------
# Reads
# ---------------------------------------------------------------------------


def test_listing_returns_the_seeded_modes_with_their_items(admin_client, mode):
    rows = admin_client.get(MODES).json()
    by_key = {r["key"]: r for r in rows}

    assert {MODE_UNRESTRICTED, "borderline", MODE_NORMAL, MODE_SAFE} <= set(by_key)
    assert set(by_key[MODE_NORMAL]["field_group_keys"]) == set(FIELD_GROUP_KEYS)
    assert by_key[MODE_NORMAL]["label_keys"] == []


def test_the_catalog_lists_every_content_label_and_every_field_group(
    admin_client, nsfw_label, mode
):
    """Every label, not just the carried ones. A label no mode carries hides
    its entries from everybody, and the page cannot warn about what it is not
    told."""
    catalog = admin_client.get("/api/access-modes/catalog").json()

    assert [g["group"] for g in catalog] == ["label", "field_group"]
    labels = next(g for g in catalog if g["group"] == "label")
    assert nsfw_label.key in {item["key"] for item in labels["items"]}
    groups = next(g for g in catalog if g["group"] == "field_group")
    assert {item["key"] for item in groups["items"]} == set(FIELD_GROUP_KEYS)


def test_a_label_carried_by_no_mode_still_appears(admin_client, nsfw_label, mode):
    """The case the page exists to surface. `normal` and `safe` carry no
    labels, and if nothing else does either, this label is hiding entries from
    everyone - including the person reading the page."""
    catalog = admin_client.get("/api/access-modes/catalog").json()
    labels = next(g for g in catalog if g["group"] == "label")
    assert nsfw_label.key in {item["key"] for item in labels["items"]}


# ---------------------------------------------------------------------------
# Writes
# ---------------------------------------------------------------------------


def test_creating_a_mode_stores_its_items(admin_client, nsfw_label, mode):
    response = admin_client.post(
        MODES,
        json={
            "key": "curated",
            "label": "Curated",
            "description": "A hand-made tier.",
            "sort_order": 5,
            "label_keys": [nsfw_label.key],
            "field_group_keys": ["credits", "system_info"],
        },
    )

    assert response.status_code == 201
    body = response.json()
    assert body["label_keys"] == [nsfw_label.key]
    assert sorted(body["field_group_keys"]) == ["credits", "system_info"]
    assert body["is_system"] is False


def test_a_duplicate_key_is_409(admin_client, mode):
    response = admin_client.post(
        MODES, json={"key": MODE_SAFE, "label": "Clash", "label_keys": [],
                     "field_group_keys": []}
    )
    assert response.status_code == 409


def test_grants_are_replaced_wholesale(admin_client, mode, nsfw_label):
    """The same contract as PUT /roles/{id}/permissions: one write, one
    bump(), no partial states."""
    target = mode(MODE_NORMAL)

    response = admin_client.put(
        f"{MODES}{target.system_id}/grants",
        json={"label_keys": [nsfw_label.key], "field_group_keys": ["credits"]},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["label_keys"] == [nsfw_label.key]
    assert body["field_group_keys"] == ["credits"]


def test_an_unknown_field_group_is_422(admin_client, mode):
    response = admin_client.put(
        f"{MODES}{mode(MODE_NORMAL).system_id}/grants",
        json={"label_keys": [], "field_group_keys": ["not_a_real_group"]},
    )
    assert response.status_code == 422


def test_an_unknown_label_is_422(admin_client, mode):
    response = admin_client.put(
        f"{MODES}{mode(MODE_NORMAL).system_id}/grants",
        json={"label_keys": ["no-such-label"], "field_group_keys": []},
    )
    assert response.status_code == 422


def test_a_grant_change_is_felt_on_the_next_request(
    db_session, admin_client, mode_client, plain_user, nsfw_label, hidden_anime
):
    """cache.bump() on the write, asserted through behaviour rather than by
    reaching into the cache. Without it the change would not be felt until the
    process restarted.

    The reader is `plain_user`, not the admin: `admin_client` already grants
    the admin account all four modes, and mode_client would grant one of them
    a second time - uq_user_access_mode, correctly, refuses that.
    """
    c = mode_client(MODE_NORMAL, user=plain_user)
    assert c.get(f"/api/anime/{hidden_anime.system_id}").status_code == 404

    admin_client.put(
        f"{MODES}{mode_normal_id(db_session)}/grants",
        json={"label_keys": [nsfw_label.key],
              "field_group_keys": list(FIELD_GROUP_KEYS)},
    )

    assert c.get(f"/api/anime/{hidden_anime.system_id}").status_code == 200


def mode_normal_id(db):
    return (
        db.query(models.AccessMode)
        .filter(models.AccessMode.key == MODE_NORMAL)
        .one()
        .system_id
    )


# ---------------------------------------------------------------------------
# The guest default moves rather than raising
# ---------------------------------------------------------------------------


def test_setting_a_new_guest_default_clears_the_old_one(
    db_session, admin_client, mode
):
    """A partial unique index permits one flagged mode. Letting the index
    enforce that would surface as a 500; the write clears the old flag in the
    same transaction so the request does what it asked."""
    response = admin_client.patch(
        f"{MODES}{mode(MODE_NORMAL).system_id}", json={"is_guest_default": True}
    )

    assert response.status_code == 200
    flagged = [
        m.key
        for m in db_session.query(models.AccessMode).filter(
            models.AccessMode.is_guest_default.is_(True)
        )
    ]
    assert flagged == [MODE_NORMAL]


def test_moving_the_guest_default_changes_what_a_visitor_sees(
    db_session, client, admin_client, mode, nsfw_label, hidden_anime
):
    """The flag is not decoration: it is what a logged-out visitor resolves."""
    assert client.get(f"/api/anime/{hidden_anime.system_id}").status_code == 404

    admin_client.patch(
        f"{MODES}{mode(MODE_UNRESTRICTED).system_id}", json={"is_guest_default": True}
    )

    assert client.get(f"/api/anime/{hidden_anime.system_id}").status_code == 200


# ---------------------------------------------------------------------------
# Refusals
# ---------------------------------------------------------------------------


def test_a_system_mode_cannot_be_deleted(admin_client, mode):
    response = admin_client.delete(f"{MODES}{mode(MODE_SAFE).system_id}")
    assert response.status_code == 409


def test_a_mode_an_account_still_holds_cannot_be_deleted(
    admin_client, admin_user, grant_mode, db_session
):
    """Deleting it would cascade the grant away and silently narrow that
    account - the same reason roles.py refuses a held role."""
    custom = models.AccessMode(key="temp", label="Temp")
    db_session.add(custom)
    db_session.flush()
    db_session.add(
        models.UserAccessMode(user_id=admin_user.id, mode_id=custom.system_id)
    )
    db_session.flush()

    response = admin_client.delete(f"{MODES}{custom.system_id}")

    assert response.status_code == 409


def test_an_unheld_custom_mode_deletes(admin_client, db_session):
    custom = models.AccessMode(key="disposable", label="Disposable")
    db_session.add(custom)
    db_session.flush()

    assert admin_client.delete(f"{MODES}{custom.system_id}").status_code == 204


def test_an_unknown_mode_is_404(admin_client):
    assert admin_client.get(f"{MODES}{uuid.uuid4()}").status_code == 404


def test_a_super_is_refused_the_whole_router(super_client, mode):
    """This is the authorization surface, so admin.authz - not manage.catalog.
    A super manages the catalogue and may not change who reaches what."""
    assert super_client.get(MODES).status_code == 401
    assert super_client.get("/api/access-modes/catalog").status_code == 401


def test_a_plain_user_is_refused(user_client, mode):
    assert user_client.get(MODES).status_code == 401
