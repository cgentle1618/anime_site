"""One copy of a game that I own, want, or have access to."""

import uuid

from sqlalchemy import (
    CheckConstraint,
    Column,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import UUID

from app.database import Base, get_taipei_now


class GameCopy(Base):
    """
    One purchase (or wish, or subscription entitlement) of one game.

    Deliberately NOT a media_source row. "Where can I watch this" and "which
    storefront do I own this on" look alike at one field, but this carries six
    - ownership, format, acquisition, price paid, currency, date - and at that
    size it is a purchase record, not a source. Putting it on media_source
    would mean six columns meaning nothing for the other eight media types.

    game_id is a real foreign key rather than the (media_type, entry_id) pair
    the polymorphic tables use: because a DLC is a `games` row, one FK covers
    game and DLC purchases identically.
    """

    __tablename__ = "game_copy"
    __table_args__ = (
        # One game can be Digital-on-Steam and Physical-on-Switch without
        # colliding; buying the same edition on the same store twice cannot.
        # user_id leads: we can both own Hollow Knight, Digital, on Steam.
        UniqueConstraint(
            "user_id", "game_id", "storefront", "copy_format",
            name="uq_game_copy_row",
        ),
        CheckConstraint(
            r"acquired_date ~ '^\d{4}(-\d{2}(-\d{2})?)?$'",
            name="ck_game_copy_acquired_date_iso",
        ),
        Index("ix_game_copy_game", "game_id"),
    )

    system_id = Column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True
    )
    game_id = Column(
        UUID(as_uuid=True),
        ForeignKey("games.system_id", ondelete="CASCADE"),
        nullable=False,
    )

    # Whose purchase this is. A copy is a purchase record, not a fact about
    # the game, so two people own two rows for the same edition.
    user_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    storefront = Column(String, nullable=True)
    ownership = Column(String, nullable=True)
    copy_format = Column(String, nullable=True)
    acquisition = Column(String, nullable=True)
    price_paid = Column(Numeric(10, 2), nullable=True)
    price_currency = Column(String, nullable=True)
    acquired_date = Column(String, nullable=True)
    remark = Column(String, nullable=True)

    position = Column(Integer, nullable=False, default=0, server_default="0")
    created_at = Column(DateTime, default=get_taipei_now)
