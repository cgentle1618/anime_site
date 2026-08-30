"""Meme ORM model - jokes, catchphrases and running gags from media entries."""

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
from sqlalchemy.dialects.postgresql import UUID

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

    `owner_id` is deliberately FK-less: it points at whichever of the ten tables
    `owner_type` names, and no single foreign key can span them.
    `app.utils.media_resolver` flags a deleted owner as missing at read time
    rather than dropping the row.

    Column order matters: `format_model_for_sheet` walks __table__.columns in
    declaration order, so this is also the Google Sheets column order.
    """

    __tablename__ = "meme"

    system_id = Column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True
    )

    # --- Linkage ---
    # The owner is a media entry OR one of the three grouping tiers, so this is
    # owner_* rather than media_*: see OWNER_TABLES in app/utils/media_resolver.
    owner_type = Column(String, nullable=True, index=True)
    owner_id = Column(UUID(as_uuid=True), nullable=True, index=True)

    # --- Content ---
    # One text and/or one image - never a list. Both optional individually, but
    # a meme with neither has nothing to show.
    text = Column(Text, nullable=True)
    # Bare filename under static/quotes/, local only: Cloud Run's filesystem is
    # ephemeral, so the frontend hides image controls off localhost. The image
    # renders above the text, so its position is not stored.
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
