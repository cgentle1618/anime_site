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
from app.services.rbac.permissions import (
    PERM_ADMIN_AUTHZ,
    PERM_MANAGE_CATALOG,
    PERM_MANAGE_PIPELINES,
)

GUEST_ROLE = "guest"


@dataclass(frozen=True)
class Viewer:
    """Who is asking, and what they may see."""

    username: Optional[str]
    role_id: Optional[UUID]
    role_name: str
    is_superuser: bool
    permissions: frozenset[str]
    # The resolved user's id, so a request can join their user_media_list row
    # without a second lookup. None for a guest - see user_list.acting_user_id
    # for what a guest reads until step 2 ships accounts. Declared here rather
    # than beside `username` as the plan suggested: a dataclass cannot put a
    # defaulted field before an undefaulted one, and GUEST_FALLBACK does not
    # pass it.
    user_id: Optional[UUID] = None
    # The decoded JWT. Nothing reads this for authorization, and now that the
    # old single-admin dependency that used to hand it back is gone, no call
    # site reads it at all - it is dead weight kept here rather than removed
    # in this task, since removing it is a separate decision.
    token_payload: Optional[dict[str, Any]] = field(default=None)
    # ------------------------------------------------------------------
    # The ACTIVE access mode, resolved per request.
    # ------------------------------------------------------------------
    # `permissions` above still means the ROLE's capability set, and has() is
    # unchanged. The two axes are disjoint by construction: the role axis
    # holds admin.*, manage.*, media_type.* and self.*; these four fields hold
    # content labels and field groups. Neither can express the other, which is
    # what lets an admin account sit in a narrow mode.
    mode_id: Optional[UUID] = None
    mode_key: Optional[str] = None
    # The labels this session may SEE. enforcement.hidden_label_ids derives
    # the complement; do not invert this.
    visible_label_ids: frozenset[UUID] = frozenset()
    field_groups: frozenset[str] = frozenset()

    def has(self, permission: str) -> bool:
        return self.is_superuser or permission in self.permissions


# The object-set fields take their defaults, which are empty - already the
# fail-closed answer. A viewer we could not resolve sees nothing labelled and
# no gated field, which is stricter than the guest default mode and correct:
# we do not know who this is.
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


def _mode_claim(payload: Optional[dict[str, Any]]) -> Optional[UUID]:
    """
    The `mode` claim as a uuid, or None.

    A missing, empty or malformed claim is None, which resolve_mode turns into
    the empty set for a signed-in caller. Fail closed: a claim we cannot parse
    must not be treated as "no restriction".
    """
    raw = (payload or {}).get("mode")
    if not raw:
        return None
    try:
        return UUID(str(raw))
    except (ValueError, AttributeError, TypeError):
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
    A plain function, not a dependency, so /api/auth/me and the capability
    dependencies below (require_admin_authz and friends) can call it directly
    rather than through FastAPI's injection.
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

        # Imported here rather than at module scope: modes.py needs Viewer and
        # get_viewer from this module at def time (require_unscoped_mode binds
        # Depends(get_viewer) as a default), so the dependency has to run one
        # way only, and this is the direction that can be deferred.
        from app.services.rbac.modes import resolve_mode

        mode = resolve_mode(db, user, _mode_claim(payload))

        return Viewer(
            username=user.username if user else None,
            user_id=user.id if user else None,
            role_id=role.system_id,
            role_name=role.name,
            is_superuser=bool(role.is_superuser),
            permissions=cache.permissions_for(db, role.system_id),
            token_payload=payload,
            mode_id=mode.mode_id,
            mode_key=mode.mode_key,
            visible_label_ids=mode.label_ids,
            field_groups=mode.field_groups,
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

    401 rather than 403, matching the one error message and header shape the
    SPA's error handling has always expected.
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


# The three capability gates, bound once at import. Routers depend on these by
# name rather than calling require_permission inline, so that swapping a
# router's gate is a one-word edit and so that grepping for a capability finds
# every route holding it.
require_admin_authz = require_permission(PERM_ADMIN_AUTHZ)
require_manage_catalog = require_permission(PERM_MANAGE_CATALOG)
require_manage_pipelines = require_permission(PERM_MANAGE_PIPELINES)


def viewer_user_id(viewer) -> Optional[UUID]:
    """
    The viewer's OWN user id, or None when nobody is logged in.

    There is deliberately no fallback to another account. plan_next and
    seasonal are per-user from Step 3 on, and every route that returns them
    demands a real account through get_current_user_id. This helper exists for
    the two paths that stay public and must simply show nothing per-user: the
    entry watch_next / read_next flags on the catalogue endpoints, and the
    seasonal bucket of /api/search. None there means "no flags, empty bucket",
    never "somebody else's".

    Takes no Session and holds no policy - it is one attribute read plus the
    None-viewer guard that _factory._finish(db, entry, viewer=None) needs.
    """
    return getattr(viewer, "user_id", None) if viewer is not None else None
