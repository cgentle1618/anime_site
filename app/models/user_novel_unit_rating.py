"""One reader's rating of one novel unit.

novel_unit.my_rating was a per-unit personal rating on a shared row. It cannot
live on user_media_list, which is keyed by media_id, because a unit is a part
of an entry rather than an entry. A two-column join table is the smallest thing
that is correct.
"""

import uuid

from sqlalchemy import Column, DateTime, ForeignKey, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID

from app.database import Base, get_taipei_now


class UserNovelUnitRating(Base):
    __tablename__ = "user_novel_unit_rating"
    __table_args__ = (
        UniqueConstraint("user_id", "unit_id", name="uq_user_novel_unit"),
    )

    system_id = Column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True
    )
    user_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    unit_id = Column(
        UUID(as_uuid=True),
        ForeignKey("novel_unit.system_id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # One of constants.MY_RATINGS - a letter grade, not a number.
    my_rating = Column(String, nullable=True)

    created_at = Column(DateTime, default=get_taipei_now)
    updated_at = Column(DateTime, default=get_taipei_now, onupdate=get_taipei_now)
