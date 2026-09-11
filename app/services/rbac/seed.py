"""
The four roles the app reads by name.

Called from the lifespan AND from migration A, because tests/api/conftest.py
resets the schema with Base.metadata.create_all and never runs Alembic - a seed
that lived only in a migration body would leave every API test role-less.
Idempotent for the same reason: the lifespan runs against a database that may
already hold these rows, and it must not duplicate or overwrite them.

Guest is granted every media type and every field group on purpose, except
the field groups listed in GUEST_WITHHELD_FIELD_GROUPS (groups whose whole
point is to withhold something from ordinary viewers - granting them by
default would defeat them). Otherwise the authorization system ships
behaving exactly like its absence; an admin narrows it further by REMOVING
grants, so no other page changes on the day it lands.
"""

from sqlalchemy.orm import Session

from app import models
from app.services.rbac.field_groups import FIELD_GROUP_KEYS
from app.services.rbac.permissions import (
    PERM_MANAGE_CATALOG,
    PERM_MANAGE_PIPELINES,
    PERM_SELF_LIST,
    PERM_SELF_PERSONAL_NOTES,
    field_group_perm,
    media_type_perm,
)
from app.services.rbac.seed_modes import SAFE_WITHHELD_FIELD_GROUPS
from app.utils.media_resolver import MEDIA_TYPE_KEYS

GUEST_ROLE = "guest"
ADMIN_ROLE = "admin"
# A signed-in member. Not an administrator and not a second kind of admin:
# guest reads plus the two self.* writes, and nothing else.
USER_ROLE = "user"
# Everything except the ability to change who may do what. NOT is_superuser:
# the point of the role is that its grant set is finite and inspectable, so a
# permission minted in code reaches it only when someone grants it.
SUPER_ROLE = "super"

# Field groups a brand-new guest role does NOT receive. A group lands here
# when its purpose is to withhold something from ordinary viewers, so
# granting it by default would defeat it.
#
# Defined in seed_modes.py now, and aliased here so the two cannot drift while
# both axes carry field groups. The role axis loses them entirely later in
# Phase B, and this alias goes with the field-group half of
# default_guest_permissions().
GUEST_WITHHELD_FIELD_GROUPS = SAFE_WITHHELD_FIELD_GROUPS


def default_guest_permissions() -> set[str]:
    """Everything a viewer could see before this system existed, minus the
    field groups in GUEST_WITHHELD_FIELD_GROUPS - those exist specifically to
    keep something from ordinary viewers, so a fresh guest must not start out
    holding them.
    """
    return {media_type_perm(mt) for mt in MEDIA_TYPE_KEYS} | {
        field_group_perm(key)
        for key in FIELD_GROUP_KEYS
        if key not in GUEST_WITHHELD_FIELD_GROUPS
    }


def default_user_permissions() -> set[str]:
    """
    A signed-in member's grants: everything a guest may read, plus the two
    permissions over their own rows.

    Derived from default_guest_permissions() rather than restated, so a media
    type or field group added later reaches both roles at once. The spec is
    explicit that this role is three permissions and not a new system - if this
    function ever grows a fourth idea, that is a design change, not a tidy-up.
    """
    return default_guest_permissions() | {PERM_SELF_LIST, PERM_SELF_PERSONAL_NOTES}


def default_super_permissions() -> set[str]:
    """
    A super account: everything a signed-in member has, plus both management
    permissions. Derived from default_user_permissions() rather than restated,
    so a media type or field group added later reaches this role too.

    admin.authz is deliberately absent. That is the whole distinction between
    this role and the admin account.
    """
    return default_user_permissions() | {
        PERM_MANAGE_CATALOG,
        PERM_MANAGE_PIPELINES,
    }


def _ensure_role(db: Session, name: str, **fields) -> models.Role:
    role = db.query(models.Role).filter(models.Role.name == name).first()
    if role is None:
        role = models.Role(name=name, **fields)
        db.add(role)
        db.flush()
    return role


def ensure_rbac_seed(db: Session) -> None:
    """Create the guest, admin, user and super roles and top up their grants."""
    guest = _ensure_role(
        db,
        GUEST_ROLE,
        label="Guest",
        description="Anyone who is not logged in.",
        is_system=True,
        is_superuser=False,
        sort_order=0,
    )
    _ensure_role(
        db,
        ADMIN_ROLE,
        label="Admin",
        description="Full access. Holds every permission implicitly.",
        is_system=True,
        is_superuser=True,
        sort_order=100,
    )
    user = _ensure_role(
        db,
        USER_ROLE,
        label="User",
        description=(
            "A signed-in member. Reads what a guest reads, and writes their "
            "own list and their own personal notes."
        ),
        is_system=True,
        is_superuser=False,
        sort_order=50,
    )
    super_role = _ensure_role(
        db,
        SUPER_ROLE,
        label="Super",
        description=(
            "Manages the catalogue and runs the pipelines. Cannot itself "
            "change roles, accounts or content labels - but running a "
            "pipeline (Pull All) can rewrite all three from the sheet, "
            "since it restores the Users and Content Label tabs and role "
            "assignments along with everything else."
        ),
        is_system=True,
        is_superuser=False,
        sort_order=75,
    )

    # Only add what is missing. An admin who deliberately removed a grant from
    # guest must not have it handed back on the next restart, so this tops up
    # the roles it just created and leaves an existing guest role alone.
    held = {
        row.permission
        for row in db.query(models.RolePermission).filter(
            models.RolePermission.role_id == guest.system_id
        )
    }
    if not held:
        for permission in sorted(default_guest_permissions()):
            db.add(
                models.RolePermission(role_id=guest.system_id, permission=permission)
            )

    # Same rule as guest above: top up only a role holding nothing at all, so
    # a grant an admin deliberately removed is not handed back on restart.
    user_held = {
        row.permission
        for row in db.query(models.RolePermission).filter(
            models.RolePermission.role_id == user.system_id
        )
    }
    if not user_held:
        for permission in sorted(default_user_permissions()):
            db.add(
                models.RolePermission(role_id=user.system_id, permission=permission)
            )

    # Same rule again: top up only a role holding nothing at all.
    super_held = {
        row.permission
        for row in db.query(models.RolePermission).filter(
            models.RolePermission.role_id == super_role.system_id
        )
    }
    if not super_held:
        for permission in sorted(default_super_permissions()):
            db.add(
                models.RolePermission(
                    role_id=super_role.system_id, permission=permission
                )
            )

    db.flush()
