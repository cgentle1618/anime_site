"""TV Show ORM model."""

import uuid

from sqlalchemy import (
    CheckConstraint,
    Column,
    DateTime,
    ForeignKeyConstraint,
    Integer,
    String,
)
from sqlalchemy.dialects.postgresql import UUID

from app.database import Base, get_taipei_now
from app.models.base import NameFallbackMixin


class TVShows(Base, NameFallbackMixin):
    """Live-action and scripted TV show entries."""

    __tablename__ = "tv_shows"
    __table_args__ = (
        # Pins this row to a media row of its own type: with media's
        # UNIQUE (system_id, media_type) on the other end, this table's row can
        # never attach itself to another type's media row.
        ForeignKeyConstraint(
            ["system_id", "media_type"],
            ["media.system_id", "media.media_type"],
            name="fk_tv_shows_media",
            ondelete="CASCADE",
            # Deferred because the parent row is written *after* this one: the
            # media row copies public_id, which a Sequence default does not
            # mint until this INSERT runs. Both rows land in one transaction
            # and the pairing is still checked, at COMMIT.
            deferrable=True,
            initially="DEFERRED",
        ),
        CheckConstraint("media_type = 'tv-show'", name="ck_tv_shows_media_type"),
        CheckConstraint(
            r"release_date ~ '^\d{4}(-\d{2}(-\d{2})?)?$'",
            name="ck_tv_shows_release_date_iso",
        ),
    )
    _name_fields = ["tv_name_en", "tv_name_cn", "tv_name_alt"]

    system_id = Column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True
    )
    # The discriminator half of the composite FK up to `media`. Constant per
    # table and pinned by ck_tv_shows_media_type; it exists so the FK can carry
    # the type, not because a row could ever be anything else.
    media_type = Column(String, nullable=False, server_default="tv-show")

    tv_name_en = Column(String, nullable=True)
    tv_name_cn = Column(String, nullable=True)
    tv_name_alt = Column(String, nullable=True)

    region = Column(String, nullable=True)
    season_part = Column(String, nullable=True)
    airing_status = Column(String, nullable=True)
    is_main = Column(String, nullable=True)

    ep_total = Column(Integer, nullable=True)

    imdb_rating = Column(String, nullable=True)
    release_date = Column(String, nullable=True)

    imdb_id = Column(String, nullable=True)
    imdb_link = Column(String, nullable=True)

    created_at = Column(DateTime, default=get_taipei_now)
    updated_at = Column(DateTime, default=get_taipei_now, onupdate=get_taipei_now)

    @property
    def display_name(self) -> str:
        sequence = [
            ("CN", self.tv_name_cn),
            ("EN", self.tv_name_en),
            ("Alt", self.tv_name_alt),
        ]
        return self.get_fallback_name(sequence, "CN")
