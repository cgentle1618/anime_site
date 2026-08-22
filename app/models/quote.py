"""Quote ORM model - memorable lines and memes drawn from media entries."""

import uuid
from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Column,
    DateTime,
    Float,
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

    `entry_id` is deliberately FK-less: it points at whichever of the seven
    media tables `media_type` names, and no single foreign key can span them.
    A deleted entry therefore leaves a dangling quote, which
    `app.utils.media_resolver` flags as missing rather than silently dropping.

    Column order matters: `format_model_for_sheet` walks __table__.columns in
    declaration order, so this is also the Google Sheets column order.
    """

    __tablename__ = "quote"
    __table_args__ = (
        CheckConstraint(
            "kind IN ('quote', 'meme')",
            name="ck_quote_kind",
        ),
    )

    system_id = Column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True
    )

    # --- Linkage ---
    media_type = Column(String, nullable=True, index=True)
    entry_id = Column(UUID(as_uuid=True), nullable=True, index=True)
    kind = Column(String, default="quote", nullable=True)

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
    # Bare filename resolved against static/quotes/ by the frontend. Local
    # only: Cloud Run's filesystem is ephemeral, so image controls are hidden
    # off localhost until quote images move to GCS.
    image_file = Column(String, nullable=True)

    # --- Classification ---
    tags = Column(JSONB, nullable=True)
    # True when the line works in any conversation ("hi") rather than fitting
    # only a specific scenario - the quote is meant to be sent as a message.
    is_general = Column(Boolean, default=False, nullable=True)
    is_favorite = Column(Boolean, default=False, nullable=True)
    # Set on every row imported from the old notes.quotes_memes lists, which
    # carried no speaker, kind, or episode to import.
    needs_review = Column(Boolean, default=False, nullable=True)

    # --- Misc ---
    sort_index = Column(Float, nullable=True)
    remark = Column(Text, nullable=True)

    created_at = Column(DateTime, default=get_taipei_now)
    updated_at = Column(DateTime, default=get_taipei_now, onupdate=get_taipei_now)
