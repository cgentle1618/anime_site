"""
The two roles the app reads by name.

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
from app.services.rbac.permissions import field_group_perm, media_type_perm
from app.utils.media_resolver import MEDIA_TYPE_KEYS

GUEST_ROLE = "guest"
ADMIN_ROLE = "admin"

# Field groups a brand-new guest role does NOT receive. A group lands here
# when its purpose is to withhold something from ordinary viewers, so
# granting it by default would defeat it.
GUEST_WITHHELD_FIELD_GROUPS: frozenset[str] = frozenset({"sources_restricted"})


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


def _ensure_role(db: Session, name: str, **fields) -> models.Role:
    role = db.query(models.Role).filter(models.Role.name == name).first()
    if role is None:
        role = models.Role(name=name, **fields)
        db.add(role)
        db.flush()
    return role


def ensure_rbac_seed(db: Session) -> None:
    """Create the guest and admin roles and top up guest's grants."""
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

    db.flush()
