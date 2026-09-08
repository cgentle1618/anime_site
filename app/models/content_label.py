"""Content labels, and the entries that carry them."""

import uuid

from sqlalchemy import (
    Column,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import UUID

from app.database import Base, get_taipei_now


class ContentLabel(Base):
    """
    One admin-managed reason an entry might be restricted, e.g. "nsfw".

    A label never names a role. A role holds `label.<key>`, and an entry
    carrying a label it does not hold disappears for that viewer. Adding a
    role therefore touches no entries, and labelling an entry touches no roles.

    Separate from system_option even though both are open vocabularies: this
    one decides who can see what, so it must not share a table with values the
    Fill pipeline writes.
    """

    __tablename__ = "content_label"

    system_id = Column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True
    )
    # Becomes the permission `label.<key>`.
    key = Column(String, nullable=False, unique=True, index=True)
    label = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    sort_order = Column(Integer, nullable=False, default=0, server_default="0")
    created_at = Column(DateTime, default=get_taipei_now)
    updated_at = Column(DateTime, default=get_taipei_now, onupdate=get_taipei_now)


class MediaContentLabel(Base):
    """
    One content label attached to one media entry.

    The entry endpoint is the FK-less (media_type, entry_id) pair that
    media_credit, media_tag, media_relation and watch_order_item all use: no
    single foreign key can span the eight media tables, so the pair is resolved
    through MEDIA_TABLES in app/utils/media_resolver.py.

    Deliberately NOT stored in media_tag. That table is keyed to system_option
    and is written by the Fill and backfill pipelines; putting access control
    in it would mean a pipeline run could silently change who can see an entry.
    """

    __tablename__ = "media_content_label"
    __table_args__ = (
        UniqueConstraint(
            "media_type", "entry_id", "label_id", name="uq_media_content_label_row"
        ),
        Index("ix_media_content_label_entry", "media_type", "entry_id"),
    )

    system_id = Column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True
    )
    # One of MEDIA_TYPE_KEYS (hyphenated).
    media_type = Column(String, nullable=False)
    entry_id = Column(UUID(as_uuid=True), nullable=False)
    label_id = Column(
        UUID(as_uuid=True),
        ForeignKey("content_label.system_id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    position = Column(Integer, nullable=False, default=0, server_default="0")
    created_at = Column(DateTime, default=get_taipei_now)
