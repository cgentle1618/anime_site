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

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/community", tags=["Community"])


@router.get(
    "/{media_id}",
    response_model=schemas.CommunityAggregate,
    summary="Public-list Aggregate for One Entry",
)
def get_community_aggregate(media_id: UUID, db: Session = Depends(get_db)):
    """
    An unknown media_id answers an empty aggregate rather than 404: this is a
    block on a detail page whose own route already decided whether the entry
    exists, and a 404 here would blank a page that is otherwise fine.
    """
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
