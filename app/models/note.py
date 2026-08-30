"""Note ORM model - one item of structured notes on any owner."""

import uuid

from sqlalchemy import Column, DateTime, Float, Index, String, Text, text
from sqlalchemy.dialects.postgresql import JSONB, UUID

from app.database import Base, get_taipei_now


class Note(Base):
    """
    One note item - one bullet, one linked resource, one episode comment.

    Replaces the `notes` JSONB column that used to sit on each of the seven
    media tables. A blob could not be validated, queried across the library, or
    edited a bullet at a time, and its shape lived in seven frontend config
    files rather than in the backend.

    `section` names an entry in app/utils/note_sections.NOTE_SECTIONS, which
    declares that section's shape - which of the content columns below it uses.
    Columns a shape does not use stay null; this is one table on purpose, so
    adding a section costs a registry entry rather than a migration.

    `owner_id` is deliberately FK-less: it points at whichever of the ten tables
    `owner_type` names, and no single foreign key can span them - the same
    reason `meme.owner_id` has none. A deleted owner leaves rows that
    `app.utils.media_resolver` flags as missing rather than silently dropping.

    Column order matters: `format_model_for_sheet` walks __table__.columns in
    declaration order, so this is also the Google Sheets column order.
    """

    __tablename__ = "note"

    system_id = Column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True
    )

    # --- Linkage ---
    # The owner may be a media entry OR one of the three grouping tiers: see
    # OWNER_TABLES in app/utils/media_resolver.
    owner_type = Column(String, nullable=True, index=True)
    owner_id = Column(UUID(as_uuid=True), nullable=True, index=True)

    # --- Which section this item belongs to ---
    section = Column(String, nullable=True, index=True)

    # --- Content, per the section's shape ---
    # Where in the work this item points: an episode, a chapter, a scene, a
    # timestamp, or the source a question came from. One free-text column
    # rather than one per medium - the section supplies the label (see
    # `locator_placeholder` in app/utils/note_sections.py) and whether it is
    # required, the way a citation pairs a locator with the kind of locator.
    locator = Column(String, nullable=True)
    # Only populated where the section declares `kinds`.
    kind = Column(String, nullable=True)
    # The second dropdown, used by the music_track shape alone: how far the
    # tracking of one song has got. Separate from `kind` because the two answer
    # different questions - `kind` is a property of the song (which cut it is),
    # `status` a property of my work on it - and one row needs both.
    status = Column(String, nullable=True)
    # The name half of a name_links item.
    title = Column(String, nullable=True)
    content = Column(Text, nullable=True)
    # List of URLs. A list even where the old shape held one, so `resources`
    # gains multi-link support without another migration.
    links = Column(JSONB, nullable=True)

    # --- Ordering within (owner, section) ---
    sort_index = Column(Float, nullable=True)

    created_at = Column(DateTime, default=get_taipei_now)
    updated_at = Column(DateTime, default=get_taipei_now, onupdate=get_taipei_now)

    __table_args__ = (
        # The only read path the notes page uses.
        Index("ix_note_owner_section", "owner_type", "owner_id", "section"),
        # `remark` is a singleton per owner, and that rule is load-bearing: the
        # read side is a scalar subquery (see the `remark` column_property in
        # app/models/__init__.py), so a second remark row for one owner makes
        # EVERY read of that entity raise "more than one row returned by a
        # subquery used as an expression" rather than degrade. Declared here as
        # well as in the database so autogenerate does not propose dropping it
        # and so create_all-built schemas (the test DB) enforce it too. Mirrors
        # the index created in revision r1e2m3a4r5k6 - keep the name and the
        # predicate identical.
        Index(
            "ix_note_one_remark_per_owner",
            "owner_type",
            "owner_id",
            unique=True,
            postgresql_where=text("section = 'remark'"),
        ),
    )
