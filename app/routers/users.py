"""
routers/users.py
User accounts, created and managed by the admin.

There is no self-registration by design: accounts exist so one person can hand
out a level of access, not so strangers can ask for one.

Two guards exist because both mistakes lock the admin out of their own site:
you cannot delete yourself, and you cannot remove the last account that can
still administer anything.
"""

import logging
from typing import List
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app import models, schemas
from app.dependencies import get_current_admin, get_db
from app.services.rbac import cache
from app.services.rbac.permissions import PERM_ADMIN
from app.services.rbac.resolver import role_for_user
from app.services.security import get_password_hash

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/api/users",
    tags=["User Management"],
    dependencies=[Depends(get_current_admin)],
)


def _to_response(user: models.User) -> schemas.ManagedUserResponse:
    return schemas.ManagedUserResponse(
        id=user.id,
        username=user.username,
        role_id=user.role_id,
        role_name=user.role_ref.name if user.role_ref else None,
    )


def _get_or_404(db: Session, user_id: UUID) -> models.User:
    user = db.get(models.User, user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="User not found.")
    return user


def _role_or_422(db: Session, role_id: UUID) -> models.Role:
    role = db.get(models.Role, role_id)
    if role is None:
        raise HTTPException(status_code=422, detail="Unknown role.")
    return role


def _can_administer(db: Session, role: models.Role) -> bool:
    if role is None:
        return False
    if role.is_superuser:
        return True
    return (
        db.query(models.RolePermission)
        .filter(
            models.RolePermission.role_id == role.system_id,
            models.RolePermission.permission == PERM_ADMIN,
        )
        .first()
        is not None
    )


def _admin_count(db: Session, excluding: UUID = None) -> int:
    count = 0
    for user in db.query(models.User).all():
        if excluding is not None and user.id == excluding:
            continue
        if _can_administer(db, role_for_user(db, user)):
            count += 1
    return count


@router.get("/", response_model=List[schemas.ManagedUserResponse], summary="List Users")
def list_users(db: Session = Depends(get_db)):
    users = db.query(models.User).order_by(models.User.username).all()
    return [_to_response(user) for user in users]


@router.post(
    "/",
    response_model=schemas.ManagedUserResponse,
    status_code=201,
    summary="Create User",
)
def create_user(payload: schemas.ManagedUserCreate, db: Session = Depends(get_db)):
    if db.query(models.User).filter(models.User.username == payload.username).first():
        raise HTTPException(status_code=409, detail="That username is taken.")
    role = _role_or_422(db, payload.role_id)

    user = models.User(
        username=payload.username,
        hashed_password=get_password_hash(payload.password),
        role_id=role.system_id,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return _to_response(user)


@router.patch(
    "/{user_id}", response_model=schemas.ManagedUserResponse, summary="Update User"
)
def update_user(
    user_id: UUID,
    payload: schemas.ManagedUserUpdate,
    db: Session = Depends(get_db),
    admin: dict = Depends(get_current_admin),
):
    user = _get_or_404(db, user_id)

    if payload.username and payload.username != user.username:
        clash = (
            db.query(models.User)
            .filter(models.User.username == payload.username)
            .first()
        )
        if clash:
            raise HTTPException(status_code=409, detail="That username is taken.")
        user.username = payload.username

    if payload.password:
        user.hashed_password = get_password_hash(payload.password)

    if payload.role_id and payload.role_id != user.role_id:
        role = _role_or_422(db, payload.role_id)
        would_lose_admin = _can_administer(
            db, role_for_user(db, user)
        ) and not _can_administer(db, role)
        if would_lose_admin and _admin_count(db, excluding=user.id) == 0:
            raise HTTPException(
                status_code=409,
                detail="This is the last account that can administer the site.",
            )
        user.role_id = role.system_id

    db.commit()
    db.refresh(user)
    cache.bump()
    return _to_response(user)


@router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_user(
    user_id: UUID,
    db: Session = Depends(get_db),
    admin: dict = Depends(get_current_admin),
):
    user = _get_or_404(db, user_id)

    if admin.get("sub") == user.username:
        raise HTTPException(status_code=409, detail="You cannot delete yourself.")
    if _can_administer(db, role_for_user(db, user)) and _admin_count(
        db, excluding=user.id
    ) == 0:
        raise HTTPException(
            status_code=409,
            detail="This is the last account that can administer the site.",
        )

    db.delete(user)
    db.commit()
    return None
