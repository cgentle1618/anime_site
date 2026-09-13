"""
routers/community.py
What the public lists collectively say about one entry.

PUBLIC LISTS ONLY, and that is a correctness rule rather than a courtesy. A
figure that moved when a private list changed would let anyone read a private
list one bit at a time by watching the number: add an entry, refresh, see the
count rise. Every query here joins users and filters on list_is_public.

The average is computed in Python from the letter grades. my_rating is one of
MY_RATINGS ("S", "A+", "A", ...), stored as a String, so AVG(my_rating::numeric)
raises on the first row. app.services.domain.rating_points owns the mapping and
the profile ordering uses the same one.
"""

import logging
from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy import func
from sqlalchemy.orm import Session

from app import models, schemas
from app.dependencies import get_db
from app.services.domain.rating_points import points_to_letter, rating_points
from app.services.rbac.enforcement import require_visible_media
from app.services.rbac.resolver import Viewer, get_viewer

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/community", tags=["Community"])

# The same words for hidden and for missing. This route serves every media
# type, so it has no per-type label to borrow the way _factory.py does.
NOT_FOUND = "Entry not found."


@router.get(
    "/{media_id}",
    response_model=schemas.CommunityAggregate,
    summary="Public-list Aggregate for One Entry",
)
def get_community_aggregate(
    media_id: UUID,
    db: Session = Depends(get_db),
    viewer: Viewer = Depends(get_viewer),
):
    """
    A hidden entry and an entry that does not exist both 404, in the same
    words, exactly as every per-type router answers (_factory.py).

    THE VIEWER DEPENDENCY IS THE POINT OF THIS ROUTE, not boilerplate. Until
    it was added this was the only router in the application with no viewer of
    any kind - its single dependency was get_db - so it answered
    unauthenticated, and `media_id` IS the entry's system_id (anime.system_id
    FKs to media.system_id). Anything holding one id could read the full
    per-status histogram, the sample size and the mean for an entry it was not
    allowed to open.

    Why the gate actually bites, which is worth stating because the intuitive
    reading is wrong: enforcement.entry_visible returns True when `viewer` is
    None, so a gate reached with None would wave everything through. It never
    is. resolver.resolve_viewer NEVER returns None - an anonymous request gets
    the guest role, or GUEST_FALLBACK with permissions=frozenset() when the
    role cannot be resolved at all. None means "no request", which only
    internal callers pass, and they do not come through here.

    An unknown id 404s too, and that is a deliberate change from the empty
    aggregate this used to answer. The two cases must agree: if hidden 404s
    while unknown answers 200, the status code becomes the existence oracle
    the gate exists to remove.

    Do NOT restore the empty-aggregate answer on the grounds that this is a
    block on a detail page whose own route already decided whether the entry
    exists. That argument needs the caller to have come through a detail page,
    and nothing enforces it - the route is reachable directly, with no session.
    """
    require_visible_media(
        db, viewer, media_id, NOT_FOUND, require_media_row=True
    )
    status_rows = (
        db.query(models.UserMediaList.status, func.count().label("count"))
        .join(models.User, models.User.id == models.UserMediaList.user_id)
        .filter(
            models.UserMediaList.media_id == media_id,
            models.User.list_is_public.is_(True),
        )
        .group_by(models.UserMediaList.status)
        .order_by(models.UserMediaList.status)
        .all()
    )

    rating_rows = (
        db.query(models.UserMediaList.my_rating)
        .join(models.User, models.User.id == models.UserMediaList.user_id)
        .filter(
            models.UserMediaList.media_id == media_id,
            models.User.list_is_public.is_(True),
            models.UserMediaList.my_rating.isnot(None),
        )
        .all()
    )
    points = [
        value
        for value in (rating_points(row.my_rating) for row in rating_rows)
        if value is not None
    ]
    average = round(sum(points) / len(points), 2) if points else None

    return schemas.CommunityAggregate(
        media_id=media_id,
        list_count=sum(row.count for row in status_rows),
        statuses=[
            schemas.CommunityStatusCount(status=row.status, count=row.count)
            for row in status_rows
        ],
        sample_size=len(points),
        average_points=average,
        average_rating=points_to_letter(average),
    )
