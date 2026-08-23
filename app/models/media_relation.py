"""Media Relation ORM model — typed, cross-media-type links between two entries."""

import uuid
from sqlalchemy import (
    CheckConstraint,
    Column,
    DateTime,
    Index,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import UUID

from app.database import Base, get_taipei_now


class MediaRelation(Base):
    """
    One typed link between two media entries, stored once and read both ways.

    Both endpoints are deliberately FK-less (media_type, entry_id) pairs, the
    same contract `watch_order_item` uses: no single foreign key can span the
    seven media tables. A deleted entry therefore leaves a dangling endpoint,
    which the read-time resolver flags as missing rather than silently dropping,
    so it stays visible and fixable in the admin page.

    Direction matters. The row reads `from` -> `to`: with relation_type
    "sequel", `from` is the sequel of `to`. The reverse label ("Prequel") is
    derived at read time from RELATION_KINDS, never stored - otherwise one fact
    could exist as two rows that no unique constraint could catch.

    Replaces the prequel_id / sequel_id / alternative columns, which could hold
    only one link each, carried no type discriminator (so a link could never
    leave its own table), and excluded anime_movies entirely.
    """

    __tablename__ = "media_relation"
    __table_args__ = (
        # An entry cannot relate to itself. Caught here as well as in the
        # router so a bad row can never be written by Pull either.
        CheckConstraint(
            "NOT (from_type = to_type AND from_id = to_id)",
            name="ck_media_relation_no_self",
        ),
        # One fact, one row. The service normalizes direction before writing -
        # `prequel` becomes a swapped `sequel`, and a symmetric `alternative`
        # sorts its two endpoints - so that this constraint actually catches
        # the duplicate a user would otherwise create from the other side.
        UniqueConstraint(
            "from_type",
            "from_id",
            "relation_type",
            "to_type",
            "to_id",
            name="uq_media_relation_pair",
        ),
        # Both directions are queried on every entry read, so neither endpoint
        # can rely on the other's index.
        Index("ix_media_relation_from", "from_type", "from_id"),
        Index("ix_media_relation_to", "to_type", "to_id"),
    )

    system_id = Column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True
    )

    from_type = Column(String, nullable=False)
    from_id = Column(UUID(as_uuid=True), nullable=False)

    # One of RELATION_KINDS in app/utils/relation_kinds.py. Not a DB enum: the
    # vocabulary is validated in the API layer, the same choice already made
    # for watch_order_item.importance, so adding a kind needs no migration.
    relation_type = Column(String, nullable=False)

    to_type = Column(String, nullable=False)
    to_id = Column(UUID(as_uuid=True), nullable=False)

    # Free text scoping the link, e.g. "covers ep 1-12 only".
    remark = Column(Text, nullable=True)

    created_at = Column(DateTime, default=get_taipei_now)
    updated_at = Column(DateTime, default=get_taipei_now, onupdate=get_taipei_now)
