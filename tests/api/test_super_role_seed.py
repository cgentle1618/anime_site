"""
`super` is everything except the ability to change who may do what.

It is the shape a second person takes: they can fix an entry and run a
pipeline, but cannot grant themselves anything or edit a role. The owner's
`admin` account remains a superset and is unaffected.
"""

import pytest

from app import models
from app.services.rbac.permissions import (
    PERM_ADMIN_AUTHZ,
    PERM_MANAGE_CATALOG,
    PERM_MANAGE_PIPELINES,
)
from app.services.rbac.seed import (
    SUPER_ROLE,
    default_super_permissions,
    default_user_permissions,
    ensure_rbac_seed,
)


@pytest.fixture
def db(db_session):
    return db_session


def test_the_super_role_exists_after_seeding(db):
    ensure_rbac_seed(db)
    db.flush()
    role = db.query(models.Role).filter(models.Role.name == SUPER_ROLE).one()
    assert role.is_system is True
    assert role.is_root is False


def test_super_holds_both_manage_permissions_and_not_authz():
    granted = default_super_permissions()
    assert PERM_MANAGE_CATALOG in granted
    assert PERM_MANAGE_PIPELINES in granted
    assert PERM_ADMIN_AUTHZ not in granted


def test_super_is_a_superset_of_user():
    """A super account still has its own list and its own personal notes."""
    assert default_user_permissions() <= default_super_permissions()


def test_seeding_twice_does_not_duplicate_the_role(db):
    ensure_rbac_seed(db)
    db.flush()
    ensure_rbac_seed(db)
    db.flush()
    assert (
        db.query(models.Role).filter(models.Role.name == SUPER_ROLE).count() == 1
    )


def test_a_grant_removed_by_hand_is_handed_back(db):
    """The one place `super` does NOT follow the rule guest and user follow.

    Top-up-only-an-empty-role exists so that a deliberate removal sticks, and
    that still holds for guest and user. Every one of this role's grants is
    locked on, though (permissions.locked_permissions), so there is no such
    thing as a deliberate removal here - a super role missing manage.pipelines
    is a row the editor would draw as a ticked, disabled box over a permission
    it does not hold. See tests/api/test_role_locks.py."""
    ensure_rbac_seed(db)
    db.flush()
    role = db.query(models.Role).filter(models.Role.name == SUPER_ROLE).one()
    db.query(models.RolePermission).filter(
        models.RolePermission.role_id == role.system_id,
        models.RolePermission.permission == PERM_MANAGE_PIPELINES,
    ).delete()
    db.flush()

    ensure_rbac_seed(db)
    db.flush()

    held = {
        row.permission
        for row in db.query(models.RolePermission).filter(
            models.RolePermission.role_id == role.system_id
        )
    }
    assert PERM_MANAGE_PIPELINES in held
