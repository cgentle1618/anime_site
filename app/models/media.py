"""
The media supertable - one row per media entry, whatever its type.

Exists so that anything pointing at "some entry" - a user's list row, a credit,
a source, a quote - can use a real foreign key instead of a
(media_type, entry_id) pair, and so that the fields every type shares can be
queried across types in one place.

PROMOTION RULE. A field belongs here only when all nine types have it AND
something queries across types by it. Both halves are required. Without the
rule this becomes a junk drawer and the detail tables hollow out; any addition
must name the cross-type query that justifies it in its commit message.
Deliberately NOT here: my_rating and watching_status (per-user, not
catalogue); mal_rating and mal_id (only the MAL-sourced types have them);
airing_status (spelled serialization_status / release_status elsewhere and not
the same concept).
"""

import uuid

from sqlalchemy import (
    Column,
    DateTime,
    ForeignKey,
    Integer,
    String,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import UUID

from app.database import Base, get_taipei_now


class Media(Base):
    __tablename__ = "media"

    system_id = Column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True
    )
    # Hyphenated, matching MEDIA_TABLES keys: "anime", "anime-movie", "tv-show".
    media_type = Column(String, nullable=False, index=True)
    # Per-type numbering is kept: each detail table still owns its own
    # <table>_public_id_seq and its own range. This column stores the value.
    public_id = Column(Integer, nullable=False)

    display_name = Column(String, nullable=False, index=True)
    cover_image_file = Column(String, nullable=True)
    franchise_id = Column(
        UUID(as_uuid=True),
        ForeignKey("franchise.system_id", ondelete="SET NULL"),
        nullable=True,
    )
    # Null for every anime-movie row: anime movies have no series.
    series_id = Column(
        UUID(as_uuid=True),
        ForeignKey("series.system_id", ondelete="SET NULL"),
        nullable=True,
    )

    created_at = Column(DateTime, default=get_taipei_now)
    updated_at = Column(DateTime, default=get_taipei_now, onupdate=get_taipei_now)

    __table_args__ = (
        # Lets a detail table FK on (system_id, media_type) and so pin its own
        # type in the database: an anime row can never point at a manga.
        UniqueConstraint("system_id", "media_type", name="uq_media_id_type"),
        UniqueConstraint(
            "media_type",
            "public_id",
            name="uq_media_type_public_id",
            # The Sheets restore can hand row A an id row B still holds until
            # the restore reaches B; only the end state has to be unique. This
            # mirrors the per-table constraint it replaces (see anime.py).
            deferrable=True,
            initially="DEFERRED",
        ),
    )
