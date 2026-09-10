"""Note ORM model - one item of structured notes on any owner."""

import uuid

from sqlalchemy import (
    CheckConstraint,
    Column,
    DateTime,
    Float,
    ForeignKey,
    Index,
    String,
    Text,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import relationship

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

    The owner is four nullable foreign keys with a CHECK that exactly one is
    set: `media_id` for any of the nine media types, and one column each for
    collection, franchise and series. No single FK can span them, because
    `media.system_id` cannot hold a franchise id. `owner_type` and `owner_id`
    survive as read-only Python properties derived from whichever column is
    set, so every existing caller keeps working - and, being properties rather
    than columns, they stay out of the Google Sheets row.

    Column order matters: `format_model_for_sheet` walks __table__.columns in
    declaration order, so this is also the Google Sheets column order. Adding
    or removing a column here reshapes the Note tab, so a change to this list
    is a Backup-before and a Backup-after.
    """

    __tablename__ = "note"

    system_id = Column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True
    )

    # --- Linkage ---
    # A note's owner is any of the twelve OWNER_TABLES keys - the nine media
    # types plus collection, franchise and series - and media.system_id cannot
    # hold a franchise id, so no single FK can span them. Four nullable FKs
    # with a CHECK that exactly one is set is what makes every owner cascade;
    # the alternative, an `entity` supertable spanning media and the tiers, was
    # rejected in the design spec because it could hold nothing but an id.
    media_id = Column(
        UUID(as_uuid=True),
        ForeignKey("media.system_id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    collection_id = Column(
        UUID(as_uuid=True),
        ForeignKey("collection.system_id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    franchise_id = Column(
        UUID(as_uuid=True),
        ForeignKey("franchise.system_id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    series_id = Column(
        UUID(as_uuid=True),
        ForeignKey("series.system_id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    # Who wrote this row. Always set, whatever the section's scope: a catalogue
    # note has an author too, and recording it is the only provenance the
    # catalogue has. What scope changes is who the row is FILTERED for, not
    # whether somebody wrote it - see app/utils/note_sections.py.
    author_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

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
    # A list of mixed items for the name_entries shape: each is
    # {"type": "text"|"link", "value": str, "label": str|None}, in array order.
    # Distinct from `links`, which is a plain list of URL strings for seven
    # other sections - one column meaning two things is how subtle bugs start.
    entries = Column(JSONB, nullable=True)

    # --- Ordering within (owner, section) ---
    sort_index = Column(Float, nullable=True)

    created_at = Column(DateTime, default=get_taipei_now)
    updated_at = Column(DateTime, default=get_taipei_now, onupdate=get_taipei_now)

    media = relationship("Media", lazy="joined")

    # `owner_type` and `owner_id` are no longer stored: they are read back from
    # whichever of the four FK columns is set. Read-only - every write goes
    # through the columns - and Python properties rather than columns, which
    # also keeps them out of the Google Sheets row that
    # format_model_for_sheet builds from __table__.columns.
    @property
    def owner_type(self):
        if self.media_id is not None:
            return self.media.media_type if self.media is not None else None
        if self.collection_id is not None:
            return "collection"
        if self.franchise_id is not None:
            return "franchise"
        if self.series_id is not None:
            return "series"
        return None

    @property
    def owner_id(self):
        return self.media_id or self.collection_id or self.franchise_id or self.series_id

    __table_args__ = (
        CheckConstraint(
            "num_nonnulls(media_id, collection_id, franchise_id, series_id) = 1",
            name="ck_note_one_owner",
        ),
        # The only read path the notes page uses.
        Index(
            "ix_note_owner_section",
            "media_id",
            "collection_id",
            "franchise_id",
            "series_id",
            "section",
        ),
        # `remark` is a singleton per owner, and that rule is load-bearing: the
        # read side is a scalar subquery (see the `remark` column_property in
        # app/models/__init__.py), so a second remark row for one owner makes
        # EVERY read of that entity raise "more than one row returned by a
        # subquery used as an expression" rather than degrade. Declared here as
        # well as in the database so autogenerate does not propose dropping it
        # and so create_all-built schemas (the test DB) enforce it too. Mirrors
        # the index created in revision r1e2m3a4r5k6 - keep the name and the
        # predicate identical.
        #
        # Per OWNER, not per owner-per-author, even though `remark` is a
        # personal-scope section: the read path is a class-level
        # column_property that cannot know who is asking. A second user's
        # remark is therefore refused rather than shown to the first user - the
        # conservative failure. The full reason is in app/models/__init__.py
        # above _REMARK_MEDIA_OWNERS; do not relax this index before that read path
        # is replaced.
        # NULLS NOT DISTINCT is required because three of the four owner
        # columns are always NULL and Postgres would otherwise treat every row
        # as unique.
        Index(
            "ix_note_one_remark_per_owner",
            "media_id",
            "collection_id",
            "franchise_id",
            "series_id",
            unique=True,
            postgresql_nulls_not_distinct=True,
            postgresql_where=text("section = 'remark'"),
        ),
    )
