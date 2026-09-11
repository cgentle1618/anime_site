"""
routers/profile.py
One user's list, read by anyone the owner allowed.

Read-only, and public by default in the routing sense - no dependency gates the
router - because the gate is per profile: a list is private unless its owner
made it public, and a private one answers 404 rather than 403 so it is
indistinguishable from a username that does not exist. That is the same rule
services.rbac.enforcement.entry_visible follows, for the same reason.

The rows a reader gets back are filtered by the READER's permissions, not the
owner's. A public list does not hand out a media type or a content label the
reader was never allowed to see; it only says which of the things they can
already see this person has on their list.
"""

import logging

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app import models, schemas
from app.dependencies import get_db
from app.services.domain.rating_points import rating_rank_case
from app.services.rbac.enforcement import apply_media_visibility
from app.services.rbac.permissions import PERM_ADMIN_AUTHZ
from app.services.rbac.resolver import Viewer, get_viewer

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/profile", tags=["Profiles"])


@router.get(
    "/{username}",
    response_model=schemas.ProfileResponse,
    summary="A User's List",
)
def get_profile(
    username: str,
    db: Session = Depends(get_db),
    viewer: Viewer = Depends(get_viewer),
):
    owner = db.query(models.User).filter(models.User.username == username).first()
    if owner is None:
        raise HTTPException(status_code=404, detail="Profile not found.")

    is_self = bool(viewer.username) and viewer.username == owner.username
    may_read = is_self or bool(owner.list_is_public) or viewer.has(PERM_ADMIN_AUTHZ)
    if not may_read:
        # 404, not 403: a private profile and a username nobody has are the
        # same answer, so a stranger cannot enumerate accounts.
        raise HTTPException(status_code=404, detail="Profile not found.")

    rank = rating_rank_case(models.UserMediaList.my_rating)
    query = (
        db.query(
            models.UserMediaList.media_id,
            models.Media.media_type,
            models.Media.public_id,
            models.Media.display_name,
            models.Media.cover_image_file,
            models.UserMediaList.status,
            models.UserMediaList.my_rating,
        )
        .join(models.Media, models.Media.system_id == models.UserMediaList.media_id)
        .filter(models.UserMediaList.user_id == owner.id)
    )
    query = apply_media_visibility(query, db, viewer)
    rows = query.order_by(
        rank.desc().nullslast(), models.Media.display_name
    ).all()

    entries = [
        schemas.ProfileEntry(
            media_id=row.media_id,
            media_type=row.media_type,
            public_id=row.public_id,
            display_name=row.display_name,
            cover_image_file=row.cover_image_file,
            status=row.status,
            my_rating=row.my_rating,
        )
        for row in rows
    ]

    # Counted from the filtered rows, not with a second GROUP BY query: the
    # figure a reader sees must match the list they were shown, or a hidden
    # entry leaks as a discrepancy in the totals.
    counts: dict[str, int] = {}
    for entry in entries:
        counts[entry.status] = counts.get(entry.status, 0) + 1

    return schemas.ProfileResponse(
        username=owner.username,
        list_is_public=bool(owner.list_is_public),
        is_self=is_self,
        counts=[
            schemas.ProfileStatusCount(status=status, count=count)
            for status, count in sorted(counts.items())
        ],
        entries=entries,
    )
