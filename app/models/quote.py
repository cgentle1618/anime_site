"""Quote ORM model - memorable lines and memes drawn from media entries."""

import uuid

from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    Float,
    ForeignKey,
    String,
    Text,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID

from app.database import Base, get_taipei_now


class Quote(Base):
    """
    One quote or meme belonging to a single media entry.

    Replaces the `quotes_memes` list that used to live inside each entry's
    `notes` JSONB column. A JSONB list could not be filtered, sorted, or
    searched across the library, which is exactly what the Quote page needs.

    Memes are not stored here. They are a sibling tier with their own table and
    a different shape (see app/models/meme.py); a Meme's content line points
    back at the Quote it also is, when it is one.

    `media_id` is a real foreign key up to the `media` supertable, ON DELETE
    SET NULL. The rule it encodes: deleting an entry must never destroy
    hand-written text. A quote carries its own content - text, translation,
    speaker, episode, tags - so it still reads perfectly once unattached. This
    replaces the older FK-less pair, which left the reference dangling for
    `app.utils.media_resolver` to flag as missing; a real FK cannot represent
    "dangling", and an unattached quote is the nearest honest thing. It is not
    confused with a deliberately general quote: that is its own flag,
    `is_general`.

    Column order matters: `format_model_for_sheet` walks __table__.columns in
    declaration order, so this is also the Google Sheets column order.
    """

    __tablename__ = "quote"
    system_id = Column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True
    )

    # --- Linkage ---
    # Nullable: a quote may belong to no entry, either because it was written
    # that way or because its entry was later deleted.
    media_id = Column(
        UUID(as_uuid=True),
        ForeignKey("media.system_id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    # Who added this line. Quotes are universal - shared, unfiltered, no
    # per-user copies - so this is provenance and nothing else: no read
    # consults it. It exists so that "who put this here?" has an answer, and so
    # that quote, meme and note agree on the same column.
    author_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # --- Content ---
    text = Column(Text, nullable=True)
    translation = Column(Text, nullable=True)
    language = Column(String, nullable=True)
    speaker = Column(String, nullable=True)
    # Set when the speaker is themselves quoting someone or something else.
    original_source = Column(String, nullable=True)

    # --- Location in the work ---
    # Free text so "S2E4", "Ch. 12" and "Vol. 3" all fit one column.
    episode = Column(String, nullable=True)

    # --- Media ---
    link = Column(String, nullable=True)
    # Bare filename resolved against static/quotes/ by the frontend. The image
    # controls are still hidden off localhost, pending a decision on how quote
    # images are served.
    image_file = Column(String, nullable=True)

    # --- Classification ---
    tags = Column(JSONB, nullable=True)
    # True when the line works in any conversation ("hi") rather than fitting
    # only a specific scenario - the quote is meant to be sent as a message.
    is_general = Column(Boolean, default=False, nullable=True)
    is_favorite = Column(Boolean, default=False, nullable=True)
    # Set on every row imported from the old notes.quotes_memes lists, which
    # carried no speaker or episode to import.
    needs_review = Column(Boolean, default=False, nullable=True)

    # --- Misc ---
    sort_index = Column(Float, nullable=True)
    remark = Column(Text, nullable=True)

    created_at = Column(DateTime, default=get_taipei_now)
    updated_at = Column(DateTime, default=get_taipei_now, onupdate=get_taipei_now)
