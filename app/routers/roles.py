"""
routers/roles.py
Roles and the permissions granted to them.

The catalog is SERVED (GET /catalog) rather than mirrored in the frontend, so
the role editor's checkbox grid is built from the same vocabulary the write
path validates against and cannot drift from it. It is grouped by family
because that is how the editor renders it - the same reason
media_relation.py::/kinds and note.py::/sections exist.

Permissions are replaced as a whole set, never added incrementally, matching
credits.py::replace_credits. An admin unticking a box means "not this", and an
append-only API could not express it.
"""

import logging
from typing import List
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app import models, schemas
from app.dependencies import get_db
from app.services.rbac import cache
from app.services.rbac.permissions import (
    ADMIN_PERMISSION_KEYS,
    ADMIN_PERMISSION_LABELS,
    FAMILY_ADMIN,
    FAMILY_MANAGE,
    FAMILY_MEDIA_TYPE,
    FAMILY_SELF,
    MANAGE_PERMISSION_KEYS,
    MANAGE_PERMISSION_LABELS,
    SELF_PERMISSION_KEYS,
    SELF_PERMISSION_LABELS,
    admin_perm,
    catalog,
    locked_permissions,
    manage_perm,
    media_type_perm,
    self_perm,
)
from app.services.rbac.resolver import require_admin_authz
from app.utils.media_resolver import MEDIA_TABLES

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/api/roles",
    tags=["Roles"],
    dependencies=[Depends(require_admin_authz)],
)


def _to_response(db: Session, role: models.Role) -> schemas.RoleResponse:
    locked_on, locked_off = locked_permissions(role.name, bool(role.is_root))
    granted = [
        row.permission
        for row in db.query(models.RolePermission.permission).filter(
            models.RolePermission.role_id == role.system_id
        )
    ]
    user_count = (
        db.query(models.User).filter(models.User.role_id == role.system_id).count()
    )
    return schemas.RoleResponse(
        system_id=role.system_id,
        name=role.name,
        label=role.label,
        description=role.description,
        sort_order=role.sort_order,
        is_system=role.is_system,
        is_root=role.is_root,
        permissions=sorted(granted),
        user_count=user_count,
        locked_on=sorted(locked_on),
        locked_off=sorted(locked_off),
    )


def _get_or_404(db: Session, role_id: UUID) -> models.Role:
    role = db.get(models.Role, role_id)
    if role is None:
        raise HTTPException(status_code=404, detail="Role not found.")
    return role


# ==========================================
# READ
# ==========================================


@router.get("/", response_model=List[schemas.RoleResponse], summary="List Roles")
def list_roles(db: Session = Depends(get_db)):
    roles = db.query(models.Role).order_by(models.Role.sort_order, models.Role.name).all()
    return [_to_response(db, role) for role in roles]


@router.get(
    "/catalog",
    response_model=List[schemas.PermissionFamilyOut],
    summary="Every Grantable Permission",
)
def get_catalog(db: Session = Depends(get_db)):
    """The whole vocabulary, grouped for the role editor.

    Content labels and field groups are deliberately NOT here. They are the
    access-mode axis (app/services/rbac/modes.py) and are granted per mode on
    /access-modes, not per role - a role cannot express "minus this label",
    because permission resolution is a union.
    """
    return [
        schemas.PermissionFamilyOut(
            family=FAMILY_ADMIN,
            label="Administration",
            permissions=[
                schemas.PermissionOut(
                    permission=admin_perm(key),
                    label=ADMIN_PERMISSION_LABELS[key][0],
                    description=ADMIN_PERMISSION_LABELS[key][1],
                )
                for key in ADMIN_PERMISSION_KEYS
            ],
        ),
        schemas.PermissionFamilyOut(
            family=FAMILY_MANAGE,
            label="Management",
            permissions=[
                schemas.PermissionOut(
                    permission=manage_perm(key),
                    label=MANAGE_PERMISSION_LABELS[key][0],
                    description=MANAGE_PERMISSION_LABELS[key][1],
                )
                for key in MANAGE_PERMISSION_KEYS
            ],
        ),
        schemas.PermissionFamilyOut(
            family=FAMILY_MEDIA_TYPE,
            label="Media Types",
            permissions=[
                schemas.PermissionOut(
                    permission=media_type_perm(key),
                    label=ref.label,
                    description=f"See {ref.label} entries at all.",
                )
                for key, ref in MEDIA_TABLES.items()
            ],
        ),
        schemas.PermissionFamilyOut(
            family=FAMILY_SELF,
            label="Own Rows",
            permissions=[
                schemas.PermissionOut(
                    permission=self_perm(key),
                    label=SELF_PERMISSION_LABELS[key][0],
                    description=SELF_PERMISSION_LABELS[key][1],
                )
                for key in SELF_PERMISSION_KEYS
            ],
        ),
    ]


@router.get(
    "/{role_id}", response_model=schemas.RoleResponse, summary="Get Role by ID"
)
def get_role(role_id: UUID, db: Session = Depends(get_db)):
    return _to_response(db, _get_or_404(db, role_id))


# ==========================================
# WRITE
# ==========================================


def _validate(db: Session, permissions: List[str]) -> None:
    known = catalog(db)
    unknown = sorted(set(permissions) - known)
    if unknown:
        raise HTTPException(
            status_code=422,
            detail=f"Unknown permission(s): {', '.join(unknown)}",
        )


def _enforce_locks(role: models.Role, requested: set[str]) -> None:
    """
    Refuse a save that disagrees with permissions.locked_permissions().

    The role editor draws these boxes disabled, so a payload reaching here can
    only come from a hand-made request - but this is the half that actually
    decides, and the half the editor reads is served from the same table, so
    the two cannot drift.
    """
    locked_on, locked_off = locked_permissions(role.name, bool(role.is_root))
    forbidden = sorted(locked_off & requested)
    if forbidden:
        raise HTTPException(
            status_code=409,
            detail=(
                f"The {role.label} role can never hold {', '.join(forbidden)}."
            ),
        )
    missing = sorted(locked_on - requested)
    if missing:
        raise HTTPException(
            status_code=409,
            detail=(
                f"The {role.label} role always holds {', '.join(missing)}."
            ),
        )


@router.post(
    "/", response_model=schemas.RoleResponse, status_code=201, summary="Create Role"
)
def create_role(payload: schemas.RoleCreate, db: Session = Depends(get_db)):
    if db.query(models.Role).filter(models.Role.name == payload.name).first():
        raise HTTPException(status_code=409, detail="A role with that name exists.")
    _validate(db, payload.permissions)
    # A new role is never guest, super or a root role, so its locks are the
    # custom-role row: admin.authz and manage.pipelines refused, nothing forced.
    _enforce_locks(
        models.Role(name=payload.name, label=payload.label, is_root=False),
        set(payload.permissions),
    )

    role = models.Role(
        name=payload.name,
        label=payload.label,
        description=payload.description,
        sort_order=payload.sort_order,
        is_system=False,
        is_root=False,
    )
    db.add(role)
    db.flush()
    for permission in sorted(set(payload.permissions)):
        db.add(models.RolePermission(role_id=role.system_id, permission=permission))
    db.commit()
    cache.bump()
    return _to_response(db, role)


@router.patch(
    "/{role_id}", response_model=schemas.RoleResponse, summary="Update Role"
)
def update_role(
    role_id: UUID, payload: schemas.RoleUpdate, db: Session = Depends(get_db)
):
    role = _get_or_404(db, role_id)
    # The app reads guest and admin by name, so those two cannot be renamed.
    # Their label and description are free.
    for field in ("label", "description", "sort_order"):
        value = getattr(payload, field)
        if value is not None:
            setattr(role, field, value)
    db.commit()
    cache.bump()
    return _to_response(db, role)


@router.put(
    "/{role_id}/permissions",
    response_model=schemas.RoleResponse,
    summary="Replace a Role's Permissions",
)
def replace_permissions(
    role_id: UUID,
    payload: schemas.RolePermissions,
    db: Session = Depends(get_db),
):
    role = _get_or_404(db, role_id)
    if role.is_root:
        raise HTTPException(
            status_code=409,
            detail="A root role role holds every permission; grants do not apply.",
        )
    _validate(db, payload.permissions)
    _enforce_locks(role, set(payload.permissions))

    db.query(models.RolePermission).filter(
        models.RolePermission.role_id == role.system_id
    ).delete(synchronize_session=False)
    for permission in sorted(set(payload.permissions)):
        db.add(models.RolePermission(role_id=role.system_id, permission=permission))
    db.commit()
    # Without this the change would not be felt until the process restarted.
    cache.bump()
    return _to_response(db, role)


@router.delete("/{role_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_role(role_id: UUID, db: Session = Depends(get_db)):
    role = _get_or_404(db, role_id)
    if role.is_system:
        raise HTTPException(
            status_code=409, detail="The guest and admin roles cannot be deleted."
        )
    holders = db.query(models.User).filter(models.User.role_id == role.system_id).count()
    if holders:
        raise HTTPException(
            status_code=409,
            detail=f"{holders} user(s) still hold this role.",
        )
    db.delete(role)
    db.commit()
    cache.bump()
    return None
