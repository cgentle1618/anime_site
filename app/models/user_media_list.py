"""
One person's relationship with one media entry.

The whole point of the multi-user design: `anime` says what Frieren is, this
says what *you* did with it. One row per (user, media). Every column here was
on a detail table before Step 1 and is on none of them after.

The table is wide and null-heavy on purpose. A manga row leaves ep_fin and
issue_fin null; a game row leaves almost everything null. The alternative -
nine per-type list tables - turns "this user's list, all types, sorted by
rating" into a nine-way UNION ALL that grows with every media type added. One
wide table with real foreign keys is the better finished system, and the design
doc records the trade so it is not relitigated.

`status` is one column standing behind watching_status / reading_status /
playing_status. The vocabulary is still per-type and still comes from
system_option, so "Might Watch" stays invalid for a game; what is shared is the
column, not the values.
"""

import uuid

from sqlalchemy import (
    Column,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import UUID

from app.database import Base, get_taipei_now


class UserMediaList(Base):
    """One user's list row for one media entry."""

    __tablename__ = "user_media_list"
    __table_args__ = (
        UniqueConstraint("user_id", "media_id", name="uq_user_media"),
        # The list page's own query: one user, filtered by status.
        Index("ix_user_media_list_user_status", "user_id", "status"),
        # The detail page's community aggregate: one media, every user.
        Index("ix_user_media_list_media", "media_id"),
    )

    system_id = Column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True
    )
    user_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    # A real foreign key, not the (media_type, entry_id) pair the older link
    # tables use. This is the highest-row-count table in the system and a
    # deleted entry must not strand every user's record of it.
    media_id = Column(
        UUID(as_uuid=True),
        ForeignKey("media.system_id", ondelete="CASCADE"),
        nullable=False,
    )

    status = Column(String, nullable=False)
    my_rating = Column(String, nullable=True)
    completed_at = Column(DateTime, nullable=True)
    my_watch_day = Column(String, nullable=True)          # anime only

    ep_fin = Column(Integer, nullable=True)               # anime, tv-show, cartoon
    # Float, not Integer: novel counts half volumes and half chapters. Manga's
    # integer values widen into it without a cast.
    vol_fin = Column(Float, nullable=True)                # manga, novel
    vol_fin_page = Column(Integer, nullable=True)         # manga
    ch_fin = Column(Float, nullable=True)                 # manga, novel
    arc_fin = Column(Float, nullable=True)                # novel
    ch_fin_in_arc = Column(Float, nullable=True)          # novel
    progress_display = Column(String, nullable=True)      # novel
    issue_fin = Column(Integer, nullable=True)            # comic

    created_at = Column(DateTime, default=get_taipei_now)
    updated_at = Column(DateTime, default=get_taipei_now, onupdate=get_taipei_now)
