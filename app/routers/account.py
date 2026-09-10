"""
routers/account.py
The caller's own account settings.

Separate from routers/users.py, which is admin-only at the router level and
acts on other people. Everything here acts on the caller and only the caller:
no path takes a user id, and the update payload carries no identity, so there
is no shape of request that could point one of these at another account.

List visibility lives here rather than on the admin Users page because it is
the account holder's decision. An admin can see the flag; they do not set it.
"""

import logging

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app import models, schemas
from app.dependencies import get_db
from app.services.rbac.resolver import Viewer, get_viewer

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/account", tags=["Account"])


def _current_user(db: Session, viewer: Viewer) -> models.User:
    """
    The row behind the session, or 401.

    resolve_viewer never raises - a bad cookie resolves to the guest viewer
    with username None - so "who is asking" and "is anyone asking" are two
    questions and this asks the second. 401 with the same detail and header
    every other refusal in this app sends, so the SPA sees one shape.
    """
    unauthenticated = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials or insufficient permissions",
        headers={"WWW-Authenticate": "Bearer"},
    )
    if not viewer.username:
        raise unauthenticated
    user = (
        db.query(models.User)
        .filter(models.User.username == viewer.username)
        .first()
    )
    if user is None:
        raise unauthenticated
    return user


def _to_response(user: models.User) -> schemas.AccountSettingsResponse:
    return schemas.AccountSettingsResponse(
        username=user.username,
        role_name=user.role_ref.name if user.role_ref else "guest",
        list_is_public=bool(user.list_is_public),
    )


@router.get(
    "/settings",
    response_model=schemas.AccountSettingsResponse,
    summary="My Account Settings",
)
def get_settings(
    db: Session = Depends(get_db), viewer: Viewer = Depends(get_viewer)
):
    return _to_response(_current_user(db, viewer))


@router.patch(
    "/settings",
    response_model=schemas.AccountSettingsResponse,
    summary="Update My Account Settings",
)
def update_settings(
    payload: schemas.AccountSettingsUpdate,
    db: Session = Depends(get_db),
    viewer: Viewer = Depends(get_viewer),
):
    """
    Making a list public exposes every row on it at /user/<username>, subject
    to the *reader's* own media-type and content-label permissions. It does not
    expose personal notes: those stay behind the personal_notes field group.
    """
    user = _current_user(db, viewer)
    user.list_is_public = payload.list_is_public
    db.commit()
    db.refresh(user)
    logger.info(
        "%s set list_is_public=%s", user.username, user.list_is_public
    )
    return _to_response(user)
