"""
routers/me_list.py
The caller's own list row, for one entry.

Step 1 moved every personal fact onto user_media_list but left the only write
path inside the per-type entry endpoints, which at the time sat behind the
single admin gate. That was correct while the admin was the only account.
Step 2 created accounts that are not admins, so the write moved here, behind
`self.list` instead: a permission with no code behind it is the inert grant
app/services/rbac/permissions.py exists to forbid. It gained the
entry_visible object-level guard in _media_or_404 below (commit 4746b1bc),
closing a gap where a holder of `self.list` could write a status onto an
entry it could not see.

Deliberately narrow. It writes ONE row - the caller's, for one media id - and
it cannot address anyone else's, because it never takes a user id. Catalogue
writes stay where they are; nothing here can touch a detail table.

The payload keys are the type's own, not the storage column names: an anime
takes `watching_status` and a manga `reading_status`, exactly as the entry
endpoints do, because user_list.LIST_FIELDS is the single place that says
which keys a type owns.
"""

import logging
from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app import models
from app.dependencies import get_db
from app.services.domain.user_list import (
    DEFAULT_STATUS,
    LIST_FIELD_DEFAULTS,
    LIST_FIELDS,
    STATUS_FIELD,
    apply_list_payload,
    ensure_list_row,
    list_row,
)
from app.services.rbac.enforcement import entry_visible
from app.services.rbac.permissions import PERM_SELF_LIST
from app.services.rbac.resolver import Viewer, require_permission

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/api/me",
    tags=["My List"],
    # Router-level, not per-route: every route here reads or writes the
    # caller's own list, so a route added later is gated by default rather
    # than by someone remembering. require_permission answers 401 (never 403),
    # matching the one error shape the SPA knows.
    dependencies=[Depends(require_permission(PERM_SELF_LIST))],
)


def _media_or_404(
    db: Session, viewer: Viewer, media_id: UUID
) -> models.Media:
    """
    The entry, if this viewer may reach it at all.

    The visibility test is NOT decoration on a write path. Until it was added,
    both handlers resolved the entry with a bare db.get and never asked, so an
    account holding `self.list` could set a status, rating and progress on an
    entry it cannot see - and confirm that entry exists - by knowing the uuid.
    The read side has been gated since the content-label work; the write side
    never was.

    The rule is that writes follow reads: if GET answers 404 for a viewer,
    every operation on that id answers 404 too. entry_visible tests the
    media-type permission as well as the labels, so this closes both halves -
    an account without `media_type.game` cannot rate a game either.

    Same message and same status as the missing-row branch, deliberately:
    a 403 here would confirm the entry exists exactly as surely as a 200.
    """
    media = db.get(models.Media, media_id)
    if media is None:
        raise HTTPException(status_code=404, detail="Entry not found")
    if not entry_visible(db, viewer, media.media_type, media.system_id):
        raise HTTPException(status_code=404, detail="Entry not found")
    return media


def _caller_id(viewer: Viewer) -> UUID:
    """
    The permission is granted to a role, and a role could in principle be held
    by nothing - so this is a guard, not a formality. It never fires for a
    signed-in account.
    """
    if viewer.user_id is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials or insufficient permissions",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return viewer.user_id


def _serialize(row, media_type: str) -> dict[str, Any]:
    """
    The row as this media type's own keys. An entry the caller has never
    touched reads back the type's default status and None for the rest -
    the same values attach_list_fields puts on an untouched entry, so a
    detail page sees one shape whichever path fed it.
    """
    status_field = STATUS_FIELD[media_type]
    out: dict[str, Any] = {"media_id": None, "media_type": media_type}
    for field_name in LIST_FIELDS[media_type]:
        if field_name == status_field:
            out[field_name] = (
                row.status if row is not None else DEFAULT_STATUS[media_type]
            )
            continue
        value = getattr(row, field_name) if row is not None else None
        if value is None and field_name in LIST_FIELD_DEFAULTS:
            value = LIST_FIELD_DEFAULTS[field_name]
        out[field_name] = value
    return out


@router.get("/list/{media_id}", summary="Read My List Row")
def read_my_list_row(
    media_id: UUID,
    db: Session = Depends(get_db),
    viewer: Viewer = Depends(require_permission(PERM_SELF_LIST)),
):
    """The caller's row for one entry. Never creates one."""
    media = _media_or_404(db, viewer, media_id)
    user_id = _caller_id(viewer)
    row = list_row(db, user_id, media_id)
    payload = _serialize(row, media.media_type)
    payload["media_id"] = str(media_id)
    return payload


@router.put("/list/{media_id}", summary="Write My List Row")
def write_my_list_row(
    media_id: UUID,
    payload: dict[str, Any],
    db: Session = Depends(get_db),
    viewer: Viewer = Depends(require_permission(PERM_SELF_LIST)),
):
    """
    Upsert the caller's row. A key this media type does not own is refused
    rather than dropped, so a typo is visible instead of silent - the same
    reasoning split_list_payload gives for leaving unknown keys in the
    catalogue half.
    """
    media = _media_or_404(db, viewer, media_id)
    user_id = _caller_id(viewer)

    owned = set(LIST_FIELDS[media.media_type])
    unknown = sorted(set(payload) - owned)
    if unknown:
        raise HTTPException(
            status_code=422,
            detail=(
                f"{media.media_type} list rows do not hold: {', '.join(unknown)}"
            ),
        )

    row = ensure_list_row(db, user_id, media_id, media.media_type)
    apply_list_payload(row, payload, media.media_type)
    db.commit()
    db.refresh(row)

    out = _serialize(row, media.media_type)
    out["media_id"] = str(media_id)
    return out
