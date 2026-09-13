"""Meme ORM model - jokes, catchphrases and running gags from media entries."""

import uuid

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Column,
    DateTime,
    Float,
    ForeignKey,
    String,
    Text,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from app.database import Base, get_taipei_now


class Meme(Base):
    """
    One meme belonging to a single media entry.

    A sibling of Quote, not a variant of it. A quote is one line carrying a
    speaker, translation, language and original source; a meme is one text, one
    image, or one of each, and carries none of that. A meme can be a single
    word.

    The two are related through `quote_id`: a meme's text may also be a Quote,
    in which case it names it. A meme need not link a quote at all.

    A meme belongs to one owner, which may be a media entry or a whole series,
    franchise or collection - a running gag often spans a franchise rather than
    sitting in one episode. Quotes stay entry-only by contrast: a quote is said
    in a specific work.

    The owner is four nullable foreign keys with a CHECK that exactly one is
    set: `media_id` for any of the nine media types, and one column each for
    collection, franchise and series. No single FK can span them, because
    `media.system_id` cannot hold a franchise id. `owner_type` and `owner_id`
    survive as read-only Python properties derived from whichever column is
    set, so every existing caller keeps working - and, being properties rather
    than columns, they stay out of the Google Sheets row.

    Column order matters: `format_model_for_sheet` walks __table__.columns in
    declaration order, so this is also the Google Sheets column order.
    """

    __tablename__ = "meme"

    system_id = Column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True
    )

    # --- Linkage ---
    # The owner is a media entry OR one of the three grouping tiers - see
    # OWNER_TABLES in app/utils/media_resolver - and no single FK spans them,
    # so there are four, with a CHECK that exactly one is set. Same shape as
    # `note`; see app/models/note.py for the full reasoning.
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
    # Who added this meme. Memes are universal - a running gag belongs to the
    # work, not to a reader - so this is provenance only and no read consults
    # it. Matches note.author_id and quote.author_id.
    author_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # --- Content ---
    # One text and/or one image - never a list. Both optional individually, but
    # a meme with neither has nothing to show.
    text = Column(Text, nullable=True)
    # A bare filename resolved against static/quotes/ for a pre-existing image,
    # or a library/-prefixed storage key for an uploaded one, resolved against
    # /static/ instead. The image renders above the text, so its position
    # is not stored.
    image_file = Column(String, nullable=True)

    # The Quote this meme's text also is, when it is one. A real column rather
    # than a value inside JSONB, which lets both rules be database constraints:
    # ON DELETE SET NULL (a deleted quote nulls the link instead of dangling)
    # and UNIQUE (a quote belongs to at most one meme; Postgres permits many
    # NULLs, so any number of memes may link none).
    quote_id = Column(
        UUID(as_uuid=True),
        ForeignKey("quote.system_id", ondelete="SET NULL"),
        nullable=True,
        unique=True,
        index=True,
    )

    # --- Context ---
    episode = Column(String, nullable=True)
    link = Column(String, nullable=True)

    # --- Classification ---
    is_favorite = Column(Boolean, default=False, nullable=True)

    # --- Misc ---
    sort_index = Column(Float, nullable=True)
    remark = Column(Text, nullable=True)

    created_at = Column(DateTime, default=get_taipei_now)
    updated_at = Column(DateTime, default=get_taipei_now, onupdate=get_taipei_now)

    media = relationship("Media", lazy="joined")

    # Read-only, derived from whichever of the four owner columns is set. Being
    # properties rather than columns also keeps them out of the Google Sheets
    # row, which format_model_for_sheet builds from __table__.columns.
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
            name="ck_meme_one_owner",
        ),
    )
