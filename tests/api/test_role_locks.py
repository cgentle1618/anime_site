"""
Which cells of the role grid are not an admin's to decide.

permissions.locked_permissions() is one table read by two halves: the role
editor draws a locked box disabled, and PUT /api/roles/{id}/permissions
refuses a payload that disagrees. Both halves are tested here, against the
same table, because a disabled checkbox the server would have accepted is a
lie, and a 409 the editor cannot provoke is dead code.

Every refusal below is paired with the mirror case that must still succeed - a
409 proves nothing on its own if the endpoint would have refused anything.
"""

import pytest

from app import models
from app.services.rbac.permissions import (
    PERM_ADMIN_AUTHZ,
    PERM_MANAGE_CATALOG,
    PERM_MANAGE_PIPELINES,
    PERM_SELF_LIST,
    PERM_SELF_PERSONAL_NOTES,
    locked_permissions,
    media_type_perm,
    static_catalog,
)
from app.services.rbac.seed import (
    ADMIN_ROLE,
    GUEST_ROLE,
    SUPER_ROLE,
    USER_ROLE,
    ensure_rbac_seed,
)

ROLES = "/api/roles/"


def _role(admin_client, name):
    rows = admin_client.get(ROLES).json()
    return next(r for r in rows if r["name"] == name)


# ---------------------------------------------------------------------------
# The table itself
# ---------------------------------------------------------------------------

def test_no_role_may_be_granted_authz():
    """The permission to change who may do what is the root role
    short-circuit and nothing else; handing it out through the very page it
    governs is how an installation loses control of itself."""
    for name in (GUEST_ROLE, USER_ROLE, SUPER_ROLE, "friend"):
        _, off = locked_permissions(name, False)
        assert PERM_ADMIN_AUTHZ in off, name


def test_super_holds_everything_except_authz_and_can_change_none_of_it():
    on, off = locked_permissions(SUPER_ROLE, False)
    assert on == static_catalog() - {PERM_ADMIN_AUTHZ}
    assert off == {PERM_ADMIN_AUTHZ}
    # Nothing at all is left for an admin to decide on this role.
    assert on | off == static_catalog()


def test_guest_can_only_view():
    """No management, and no "own" anything: every anonymous request resolves
    to this role, so a self.* grant would hand one shared list to the whole
    internet."""
    on, off = locked_permissions(GUEST_ROLE, False)
    assert on == set()
    assert off == {
        PERM_ADMIN_AUTHZ,
        PERM_MANAGE_CATALOG,
        PERM_MANAGE_PIPELINES,
        PERM_SELF_LIST,
        PERM_SELF_PERSONAL_NOTES,
    }
    # Media types stay free - narrowing what a guest may read is the point of
    # the page.
    assert media_type_perm("anime") not in off


@pytest.mark.parametrize("name", [USER_ROLE, "friend"])
def test_catalogue_is_a_choice_for_user_and_custom_roles_but_pipelines_is_not(name):
    on, off = locked_permissions(name, False)
    assert on == set()
    assert PERM_MANAGE_PIPELINES in off
    # The mirror: these three are neither forced nor refused.
    for permission in (PERM_MANAGE_CATALOG, PERM_SELF_LIST, media_type_perm("anime")):
        assert permission not in on and permission not in off


def test_a_root_role_holds_everything_except_its_own_rows():
    """Viewer.has() deliberately does not short-circuit the self family, so an
    administrative account keeps no list and no personal notes. Drawing those
    two boxes ticked would state the opposite of what the resolver does."""
    on, off = locked_permissions(ADMIN_ROLE, True)
    assert off == {PERM_SELF_LIST, PERM_SELF_PERSONAL_NOTES}
    assert on == static_catalog() - off
    assert PERM_ADMIN_AUTHZ in on


# ---------------------------------------------------------------------------
# Served to the editor
# ---------------------------------------------------------------------------

def test_the_role_list_serves_the_locks(admin_client):
    super_role = _role(admin_client, SUPER_ROLE)
    assert PERM_ADMIN_AUTHZ in super_role["locked_off"]
    assert PERM_MANAGE_CATALOG in super_role["locked_on"]

    user_role = _role(admin_client, USER_ROLE)
    assert user_role["locked_on"] == []
    assert PERM_MANAGE_CATALOG not in user_role["locked_off"]


def test_the_admin_role_serves_every_management_permission_as_locked_on(admin_client):
    """The admin tab shows the whole grid ticked and unchangeable - except Own
    Rows, which it genuinely does not hold."""
    admin_role = _role(admin_client, ADMIN_ROLE)
    for permission in (PERM_ADMIN_AUTHZ, PERM_MANAGE_CATALOG, PERM_MANAGE_PIPELINES):
        assert permission in admin_role["locked_on"]
    assert sorted(admin_role["locked_off"]) == sorted(
        [PERM_SELF_LIST, PERM_SELF_PERSONAL_NOTES]
    )


# ---------------------------------------------------------------------------
# Enforced on the write path
# ---------------------------------------------------------------------------

def test_a_guest_may_not_be_granted_its_own_list(admin_client):
    guest_id = _role(admin_client, GUEST_ROLE)["system_id"]
    response = admin_client.put(
        f"{ROLES}{guest_id}/permissions",
        json={"permissions": [media_type_perm("anime"), PERM_SELF_LIST]},
    )
    assert response.status_code == 409

    # The mirror: the same save without the self grant is accepted, so the 409
    # above came from that permission and not from the role being untouchable.
    ok = admin_client.put(
        f"{ROLES}{guest_id}/permissions",
        json={"permissions": [media_type_perm("anime")]},
    )
    assert ok.status_code == 200
    assert ok.json()["permissions"] == [media_type_perm("anime")]


def test_a_user_role_may_hold_the_catalogue_but_never_the_pipelines(admin_client):
    user_id = _role(admin_client, USER_ROLE)["system_id"]

    refused = admin_client.put(
        f"{ROLES}{user_id}/permissions",
        json={"permissions": [PERM_MANAGE_CATALOG, PERM_MANAGE_PIPELINES]},
    )
    assert refused.status_code == 409
    assert PERM_MANAGE_PIPELINES in refused.text

    allowed = admin_client.put(
        f"{ROLES}{user_id}/permissions",
        json={"permissions": [PERM_MANAGE_CATALOG, PERM_SELF_LIST]},
    )
    assert allowed.status_code == 200
    assert PERM_MANAGE_CATALOG in allowed.json()["permissions"]


def test_the_super_role_cannot_have_anything_taken_away(admin_client):
    super_id = _role(admin_client, SUPER_ROLE)["system_id"]
    full = sorted(static_catalog() - {PERM_ADMIN_AUTHZ})

    dropped = admin_client.put(
        f"{ROLES}{super_id}/permissions",
        json={"permissions": [p for p in full if p != PERM_MANAGE_CATALOG]},
    )
    assert dropped.status_code == 409
    assert PERM_MANAGE_CATALOG in dropped.text

    added = admin_client.put(
        f"{ROLES}{super_id}/permissions",
        json={"permissions": full + [PERM_ADMIN_AUTHZ]},
    )
    assert added.status_code == 409

    unchanged = admin_client.put(
        f"{ROLES}{super_id}/permissions", json={"permissions": full}
    )
    assert unchanged.status_code == 200
    assert unchanged.json()["permissions"] == full


def test_a_new_role_cannot_be_created_holding_a_locked_permission(admin_client):
    for index, permission in enumerate((PERM_ADMIN_AUTHZ, PERM_MANAGE_PIPELINES)):
        response = admin_client.post(
            ROLES,
            json={
                "name": f"sneaky{index}",
                "label": "Sneaky",
                "permissions": [permission],
            },
        )
        assert response.status_code == 409, permission

    ok = admin_client.post(
        ROLES,
        json={
            "name": "curator",
            "label": "Curator",
            "permissions": [PERM_MANAGE_CATALOG],
        },
    )
    assert ok.status_code == 201


# ---------------------------------------------------------------------------
# Enforced by the seed
# ---------------------------------------------------------------------------

def test_the_seed_restores_a_locked_grant_removed_by_hand(db_session):
    """The top-up rule leaves an established role alone so that a deliberate
    removal sticks. A LOCKED grant is the exception: `super` means everything
    but authorization, so a super role sitting in the database without
    manage.pipelines would have the editor drawing a ticked, disabled box over
    a permission it does not actually hold."""
    ensure_rbac_seed(db_session)
    db_session.flush()
    role = db_session.query(models.Role).filter(models.Role.name == SUPER_ROLE).one()
    db_session.query(models.RolePermission).filter(
        models.RolePermission.role_id == role.system_id,
        models.RolePermission.permission == PERM_MANAGE_PIPELINES,
    ).delete()
    db_session.flush()

    ensure_rbac_seed(db_session)
    db_session.flush()

    held = {
        row.permission
        for row in db_session.query(models.RolePermission).filter(
            models.RolePermission.role_id == role.system_id
        )
    }
    assert PERM_MANAGE_PIPELINES in held


def test_the_seed_drops_a_grant_a_role_may_no_longer_hold(db_session):
    """A guest role still carrying manage.catalog is exactly the row that must
    not survive a restart."""
    ensure_rbac_seed(db_session)
    db_session.flush()
    guest = db_session.query(models.Role).filter(models.Role.name == GUEST_ROLE).one()
    db_session.add(
        models.RolePermission(role_id=guest.system_id, permission=PERM_MANAGE_CATALOG)
    )
    db_session.flush()

    ensure_rbac_seed(db_session)
    db_session.flush()

    held = {
        row.permission
        for row in db_session.query(models.RolePermission).filter(
            models.RolePermission.role_id == guest.system_id
        )
    }
    assert PERM_MANAGE_CATALOG not in held
    # The mirror: the reads it is supposed to keep are still there.
    assert media_type_perm("anime") in held
