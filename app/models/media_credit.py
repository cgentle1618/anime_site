"""Link tables joining a media entry to the entities and vocabulary it uses."""

import uuid

from sqlalchemy import (
    CheckConstraint,
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


class MediaCredit(Base):
    """
    One person or studio credited on one media entry.

    The entry endpoint is a FK-less (media_type, entry_id) pair, the same
    contract media_relation and watch_order_item use: no single foreign key can
    span the eight media tables, so the pair is resolved at read time through
    MEDIA_TABLES in app/utils/media_resolver.py.

    Exactly one of person_id / studio_id is set, enforced by a CHECK rather
    than by convention, because both the migration and the Fill pipeline write
    these rows without going through the API.

    position carries the order the names had in the comma-joined column this
    table replaced, so "Studio A, Studio B" still reads in that order.
    """

    __tablename__ = "media_credit"
    __table_args__ = (
        CheckConstraint(
            "num_nonnulls(person_id, studio_id) = 1",
            name="ck_media_credit_one_target",
        ),
        # NULLS NOT DISTINCT: person_id and studio_id are each nullable (only
        # one is set per row), and Postgres treats two NULLs as distinct by
        # default - without this, the same person could be credited with the
        # same role on the same entry twice, since (person_id, NULL) would
        # never collide with itself.
        UniqueConstraint(
            "media_type",
            "entry_id",
            "role",
            "person_id",
            "studio_id",
            name="uq_media_credit_row",
            postgresql_nulls_not_distinct=True,
        ),
        Index("ix_media_credit_entry", "media_type", "entry_id"),
    )

    system_id = Column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True
    )
    # One of MEDIA_TYPE_KEYS (hyphenated).
    media_type = Column(String, nullable=False)
    entry_id = Column(UUID(as_uuid=True), nullable=False)
    # One of credit_roles.CREDIT_ROLE_KEYS.
    role = Column(String, nullable=False, index=True)
    person_id = Column(
        UUID(as_uuid=True),
        ForeignKey("person.system_id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    studio_id = Column(
        UUID(as_uuid=True),
        ForeignKey("studio.system_id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    position = Column(Integer, nullable=False, default=0, server_default="0")
    remark = Column(Text, nullable=True)
    created_at = Column(DateTime, default=get_taipei_now)


class MediaTag(Base):
    """
    One vocabulary value attached to one media entry.

    `field` rather than `category` because one category can serve several
    fields - "Publisher / Distributor TW" backs publisher_tw on four media
    types - while one field always maps to exactly one category. The
    field -> category map lives in app/utils/credit_roles.py.
    """

    __tablename__ = "media_tag"
    __table_args__ = (
        UniqueConstraint(
            "media_type", "entry_id", "field", "option_id", name="uq_media_tag_row"
        ),
        Index("ix_media_tag_entry", "media_type", "entry_id"),
    )

    system_id = Column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True
    )
    media_type = Column(String, nullable=False)
    entry_id = Column(UUID(as_uuid=True), nullable=False)
    # One of credit_roles.TAG_FIELD_KEYS.
    field = Column(String, nullable=False, index=True)
    option_id = Column(
        UUID(as_uuid=True),
        ForeignKey("system_option.system_id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    position = Column(Integer, nullable=False, default=0, server_default="0")
    created_at = Column(DateTime, default=get_taipei_now)
