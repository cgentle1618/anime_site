"""
The three capability permissions that replace the bare `admin`.

`admin.authz` is the ability to change who may do what. `manage.catalog` is
every catalogue write. `manage.pipelines` is Backup, Pull, Fill, Replace and
Calculate - split out because a helper account should be able to fix a typo
without being able to overwrite the whole database.
"""

import pytest

from app.services.rbac.permissions import (
    PERM_ADMIN_AUTHZ,
    PERM_MANAGE_CATALOG,
    PERM_MANAGE_PIPELINES,
    is_valid,
    split_perm,
    static_catalog,
)


@pytest.fixture
def db(db_session):
    return db_session


def test_the_three_permissions_are_in_the_static_catalog():
    catalog = static_catalog()
    assert PERM_ADMIN_AUTHZ in catalog
    assert PERM_MANAGE_CATALOG in catalog
    assert PERM_MANAGE_PIPELINES in catalog


def test_they_validate_as_grantable(db):
    for permission in (PERM_ADMIN_AUTHZ, PERM_MANAGE_CATALOG,
                       PERM_MANAGE_PIPELINES):
        assert is_valid(db, permission), permission


def test_they_split_into_family_and_key():
    assert split_perm(PERM_ADMIN_AUTHZ) == ("admin", "authz")
    assert split_perm(PERM_MANAGE_CATALOG) == ("manage", "catalog")
    assert split_perm(PERM_MANAGE_PIPELINES) == ("manage", "pipelines")


def test_the_role_editor_offers_them(admin_client):
    families = {f["family"]: f for f in admin_client.get("/api/roles/catalog").json()}
    assert "manage" in families
    offered = {p["permission"] for p in families["manage"]["permissions"]}
    assert offered == {PERM_MANAGE_CATALOG, PERM_MANAGE_PIPELINES}
    admin_family = {p["permission"] for p in families["admin"]["permissions"]}
    assert PERM_ADMIN_AUTHZ in admin_family


def test_every_offered_permission_has_a_label_and_description(admin_client):
    """A permission with no copy is unusable in the editor."""
    for family in admin_client.get("/api/roles/catalog").json():
        for permission in family["permissions"]:
            assert permission["label"], permission
            assert permission["description"], permission
