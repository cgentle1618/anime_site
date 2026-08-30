"""
The admin API for roles, users and content labels.

The guards here are the ones that matter: an unknown permission must be
rejected rather than stored inert, the two system roles must survive, and no
sequence of edits may leave the site with nobody who can administer it.
"""

import uuid

import pytest

from app import models
from app.services.rbac.permissions import PERM_ADMIN, media_type_perm

ROLES = "/api/roles/"
USERS = "/api/users/"
LABELS = "/api/content-labels/"


def _role_id(admin_client, name):
    for role in admin_client.get(ROLES).json():
        if role["name"] == name:
            return role["system_id"]
    raise AssertionError(f"role {name} not found")


# ---------------------------------------------------------------------------
# Auth
# ---------------------------------------------------------------------------

@pytest.mark.parametrize("path", [ROLES, USERS, LABELS, "/api/roles/catalog"])
def test_the_admin_api_is_closed_to_a_guest(client, path):
    assert client.get(path).status_code == 401


# ---------------------------------------------------------------------------
# Catalog
# ---------------------------------------------------------------------------

def test_the_catalog_lists_every_family(admin_client):
    families = {f["family"] for f in admin_client.get("/api/roles/catalog").json()}
    assert families == {"admin", "media_type", "field_group", "label"}


def test_a_new_label_appears_in_the_catalog(admin_client):
    admin_client.post(
        LABELS, json={"key": "spoiler", "label": "Spoiler", "sort_order": 0}
    )
    catalog = admin_client.get("/api/roles/catalog").json()
    label_family = next(f for f in catalog if f["family"] == "label")
    assert "label.spoiler" in {p["permission"] for p in label_family["permissions"]}


# ---------------------------------------------------------------------------
# Roles
# ---------------------------------------------------------------------------

def test_creating_a_role_stores_its_grants(admin_client):
    response = admin_client.post(
        ROLES,
        json={
            "name": "friend",
            "label": "Friend",
            "permissions": [media_type_perm("anime")],
        },
    )
    assert response.status_code == 201
    assert response.json()["permissions"] == [media_type_perm("anime")]


def test_an_unknown_permission_is_rejected(admin_client):
    """A grant naming nothing would be stored and silently do nothing."""
    response = admin_client.post(
        ROLES,
        json={"name": "bogus", "label": "Bogus", "permissions": ["media_type.hologram"]},
    )
    assert response.status_code == 422
    assert "hologram" in response.text


def test_permissions_are_replaced_not_appended(admin_client):
    role_id = admin_client.post(
        ROLES,
        json={
            "name": "replaceme",
            "label": "Replace",
            "permissions": [media_type_perm("anime"), media_type_perm("manga")],
        },
    ).json()["system_id"]

    response = admin_client.put(
        f"/api/roles/{role_id}/permissions",
        json={"permissions": [media_type_perm("manga")]},
    )
    assert response.status_code == 200
    assert response.json()["permissions"] == [media_type_perm("manga")]


def test_a_system_role_cannot_be_deleted(admin_client):
    guest = _role_id(admin_client, "guest")
    response = admin_client.delete(f"/api/roles/{guest}")
    assert response.status_code == 409


def test_a_role_users_still_hold_cannot_be_deleted(admin_client):
    role_id = admin_client.post(
        ROLES, json={"name": "held", "label": "Held", "permissions": []}
    ).json()["system_id"]
    admin_client.post(
        USERS, json={"username": "holder", "password": "x", "role_id": role_id}
    )
    response = admin_client.delete(f"/api/roles/{role_id}")
    assert response.status_code == 409


def test_an_unheld_role_can_be_deleted(admin_client):
    role_id = admin_client.post(
        ROLES, json={"name": "spare", "label": "Spare", "permissions": []}
    ).json()["system_id"]
    assert admin_client.delete(f"/api/roles/{role_id}").status_code == 204


# ---------------------------------------------------------------------------
# A revoked permission takes effect immediately
# ---------------------------------------------------------------------------

def test_revoking_a_permission_is_felt_without_re_login(
    admin_client, client, db_session, sample_anime
):
    """
    The whole reason permissions are resolved per request instead of carried in
    the JWT. If this fails, the cache is not being bumped on write.
    """
    from app.services.security import create_access_token

    role_id = admin_client.post(
        ROLES,
        json={
            "name": "watcher",
            "label": "Watcher",
            "permissions": [media_type_perm("anime")],
        },
    ).json()["system_id"]
    admin_client.post(
        USERS, json={"username": "watcher1", "password": "x", "role_id": role_id}
    )

    token = create_access_token({"sub": "watcher1", "role": "watcher"})
    client.cookies.set("access_token", f"Bearer {token}")
    assert str(sample_anime.system_id) in client.get("/api/anime/").text

    admin_client.put(f"/api/roles/{role_id}/permissions", json={"permissions": []})

    # Same cookie, no re-login.
    assert client.get("/api/anime/").json() == []


# ---------------------------------------------------------------------------
# Users
# ---------------------------------------------------------------------------

def test_creating_a_user_assigns_the_role(admin_client):
    guest = _role_id(admin_client, "guest")
    response = admin_client.post(
        USERS, json={"username": "newbie", "password": "pw", "role_id": guest}
    )
    assert response.status_code == 201
    assert response.json()["role_name"] == "guest"


def test_a_duplicate_username_is_rejected(admin_client):
    guest = _role_id(admin_client, "guest")
    body = {"username": "twice", "password": "pw", "role_id": guest}
    assert admin_client.post(USERS, json=body).status_code == 201
    assert admin_client.post(USERS, json=body).status_code == 409


def test_an_unknown_role_is_rejected(admin_client):
    response = admin_client.post(
        USERS,
        json={"username": "orphan", "password": "pw", "role_id": str(uuid.uuid4())},
    )
    assert response.status_code == 422


def test_you_cannot_delete_yourself(admin_client, db_session):
    me = db_session.query(models.User).filter(
        models.User.username == "testadmin"
    ).first()
    response = admin_client.delete(f"/api/users/{me.id}")
    assert response.status_code == 409


def test_the_last_administrator_cannot_be_demoted(admin_client, db_session):
    """Otherwise one PATCH locks everyone out of their own site."""
    guest = _role_id(admin_client, "guest")
    me = db_session.query(models.User).filter(
        models.User.username == "testadmin"
    ).first()

    # The lifespan seeds a real "admin" account into the test database, so
    # demote every other administrator first to actually reach the last one.
    for user in db_session.query(models.User).all():
        if user.id != me.id:
            admin_client.patch(f"/api/users/{user.id}", json={"role_id": guest})

    response = admin_client.patch(f"/api/users/{me.id}", json={"role_id": guest})
    assert response.status_code == 409
    assert "last account" in response.text


def test_demotion_is_allowed_while_another_admin_remains(admin_client, db_session):
    admin_role = _role_id(admin_client, "admin")
    guest = _role_id(admin_client, "guest")
    admin_client.post(
        USERS, json={"username": "second", "password": "pw", "role_id": admin_role}
    )

    me = db_session.query(models.User).filter(
        models.User.username == "testadmin"
    ).first()
    response = admin_client.patch(f"/api/users/{me.id}", json={"role_id": guest})
    assert response.status_code == 200


# ---------------------------------------------------------------------------
# Content labels
# ---------------------------------------------------------------------------

def test_a_label_key_is_unique(admin_client):
    body = {"key": "nsfw", "label": "NSFW"}
    assert admin_client.post(LABELS, json=body).status_code == 201
    assert admin_client.post(LABELS, json=body).status_code == 409


def test_labels_are_assigned_to_an_entry_as_a_whole_set(admin_client, sample_anime):
    admin_client.post(LABELS, json={"key": "nsfw", "label": "NSFW"})
    admin_client.post(LABELS, json={"key": "spoiler", "label": "Spoiler"})

    url = f"/api/content-labels/entry/anime/{sample_anime.system_id}"
    assert admin_client.put(url, json={"label_keys": ["nsfw", "spoiler"]}).json() == [
        "nsfw",
        "spoiler",
    ]
    assert admin_client.put(url, json={"label_keys": ["nsfw"]}).json() == ["nsfw"]
    assert admin_client.get(url).json() == ["nsfw"]


def test_an_unknown_label_key_is_rejected(admin_client, sample_anime):
    response = admin_client.put(
        f"/api/content-labels/entry/anime/{sample_anime.system_id}",
        json={"label_keys": ["nope"]},
    )
    assert response.status_code == 422


def test_an_unknown_media_type_is_a_400(admin_client, sample_anime):
    response = admin_client.get(
        f"/api/content-labels/entry/hologram/{sample_anime.system_id}"
    )
    assert response.status_code == 400


def test_labelling_an_entry_hides_it_from_a_guest(admin_client, client, sample_anime):
    """End to end: the admin API and the enforcement path agree."""
    assert str(sample_anime.system_id) in client.get("/api/anime/").text

    admin_client.post(LABELS, json={"key": "nsfw", "label": "NSFW"})
    admin_client.put(
        f"/api/content-labels/entry/anime/{sample_anime.system_id}",
        json={"label_keys": ["nsfw"]},
    )

    assert str(sample_anime.system_id) not in client.get("/api/anime/").text


def test_the_guest_role_can_never_be_granted_admin(admin_client):
    """An anonymous request resolves to the guest role's grants, so admin on
    guest would make every visitor an administrator with one misclick."""
    guest_id = _role_id(admin_client, "guest")
    response = admin_client.put(
        f"{ROLES}{guest_id}/permissions", json={"permissions": [PERM_ADMIN]}
    )
    assert response.status_code == 409
    after = admin_client.get(f"{ROLES}{guest_id}").json()
    assert PERM_ADMIN not in after["permissions"]
