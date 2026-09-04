"""
Where an entry can be watched, read, or looked up.

Shaped like media_credit: no single foreign key can span the eight media
tables, so the (media_type, entry_id) pair is resolved at read time through
MEDIA_TABLES in app/utils/media_resolver.py.

Two axes, both plain strings so a value added in a newer version survives a
round trip through an older one:

  kind    access    somewhere to watch or read the work
          reference somewhere to read *about* it - a wiki, a database

  bucket  main       a vocabulary platform, pointed at by option_id
          other      free-form, gated by the sources_other field group
          restricted free-form, gated by sources_restricted

A row carries exactly one target: option_id for a vocabulary platform, name for
a free-form one. `available` is the tristate that used to be source_baha -
True available, False not, NULL unknown - and is meaningful only on main access
rows, because a wiki page either has a URL or it does not.
"""

import uuid

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Column,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import UUID

from app.database import Base, get_taipei_now


class MediaSource(Base):
    __tablename__ = "media_source"
    __table_args__ = (
        CheckConstraint(
            "num_nonnulls(option_id, name) = 1",
            name="ck_media_source_one_target",
        ),
        # nulls_not_distinct so two free-form rows with the same name on one
        # entry collide instead of both being stored - option_id is NULL on
        # both, and the default NULL-is-distinct rule would let them through.
        UniqueConstraint(
            "media_type",
            "entry_id",
            "kind",
            "bucket",
            "option_id",
            "name",
            name="uq_media_source_row",
            postgresql_nulls_not_distinct=True,
        ),
        Index("ix_media_source_entry", "media_type", "entry_id"),
    )

    system_id = Column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True
    )

    # MEDIA_TYPE_KEYS, hyphenated. No FK - see the module docstring.
    media_type = Column(String, nullable=False)
    entry_id = Column(UUID(as_uuid=True), nullable=False)

    kind = Column(String, nullable=False, index=True)
    bucket = Column(String, nullable=False, index=True)

    option_id = Column(
        UUID(as_uuid=True),
        ForeignKey("system_option.system_id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    name = Column(String, nullable=True)

    available = Column(Boolean, nullable=True)
    url = Column(String, nullable=True)

    position = Column(Integer, nullable=False, default=0, server_default="0")
    created_at = Column(DateTime, default=get_taipei_now)
