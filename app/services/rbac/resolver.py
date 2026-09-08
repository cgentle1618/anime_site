"""
Request -> Viewer.

One function answers "who is asking" for every route, authenticated or not.
It never raises: a missing, malformed, expired or badly-signed cookie, a user
row that has since been deleted, and a role that no longer exists all resolve
to the guest viewer. Failing closed rather than erroring is what lets the same
call serve /api/auth/me, which three tests require never to raise, and the
public read routes, which must stay public.
"""

from dataclasses import dataclass, field
from typing import Any, Optional
from uuid import UUID

import jwt
from fastapi import Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from app import models
from app.dependencies import ALGORITHM, SECRET_KEY, get_db
from app.services.rbac import cache

GUEST_ROLE = "guest"


@dataclass(frozen=True)
class Viewer:
    """Who is asking, and what they may see."""

    username: Optional[str]
    role_id: Optional[UUID]
    role_name: str
    is_superuser: bool
    permissions: frozenset[str]
    # The decoded JWT, kept only so get_current_admin can hand back what it
    # always did. Nothing reads it for authorization.
    token_payload: Optional[dict[str, Any]] = field(default=None)

    def has(self, permission: str) -> bool:
        return self.is_superuser or permission in self.permissions


GUEST_FALLBACK = Viewer(
    username=None,
    role_id=None,
    role_name=GUEST_ROLE,
    is_superuser=False,
    permissions=frozenset(),
)


def _decode(request: Request) -> Optional[dict[str, Any]]:
    token = request.cookies.get("access_token")
    if not token or not token.startswith("Bearer "):
        return None
    try:
        return jwt.decode(token.split(" ")[1], SECRET_KEY, algorithms=[ALGORITHM])
    except jwt.PyJWTError:
        return None


def role_for_user(db: Session, user: Optional[models.User]) -> Optional[models.Role]:
    """
    The user's role, or the guest role for an anonymous caller.

    role_id is NOT NULL since migration C, so a user always has one. A user
    whose role row has since been deleted still falls to guest rather than
    erroring - least access, not most.
    """
    if user is not None and user.role_ref is not None:
        return user.role_ref
    return db.query(models.Role).filter(models.Role.name == GUEST_ROLE).first()


def resolve_viewer(request: Request, db: Session) -> Viewer:
    """
    A plain function, not a dependency, so get_current_admin and /api/auth/me
    can call it directly rather than through FastAPI's injection.
    """
    try:
        payload = _decode(request)
        user = None
        if payload and payload.get("sub"):
            user = (
                db.query(models.User)
                .filter(models.User.username == payload["sub"])
                .first()
            )

        role = role_for_user(db, user)
        if role is None:
            return GUEST_FALLBACK

        return Viewer(
            username=user.username if user else None,
            role_id=role.system_id,
            role_name=role.name,
            is_superuser=bool(role.is_superuser),
            permissions=cache.permissions_for(db, role.system_id),
            token_payload=payload,
        )
    except Exception:
        # A viewer we cannot resolve sees what an anonymous stranger sees.
        return GUEST_FALLBACK


def get_viewer(request: Request, db: Session = Depends(get_db)) -> Viewer:
    """FastAPI dependency form. Deduped per request by the dependency cache."""
    return resolve_viewer(request, db)


def require_permission(permission: str):
    """
    Dependency factory gating a route on one permission.

    401 rather than 403, matching the message and header get_current_admin has
    always sent, so the SPA's error handling sees one shape.
    """

    def _dependency(viewer: Viewer = Depends(get_viewer)) -> Viewer:
        if not viewer.has(permission):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Could not validate credentials or insufficient permissions",
                headers={"WWW-Authenticate": "Bearer"},
            )
        return viewer

    return _dependency
