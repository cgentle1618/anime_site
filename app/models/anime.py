"""Anime ORM model."""

import uuid

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Column,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Time,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from app.database import Base, get_taipei_now
from app.models.base import NameFallbackMixin


class Anime(Base, NameFallbackMixin):
    """
    The granular media entry. Contains all metadata for tracking, production, and sources.
    """

    __tablename__ = "anime"
    __table_args__ = (
        CheckConstraint(
            r"release_date ~ '^\d{4}(-\d{2}(-\d{2})?)?$'",
            name="ck_anime_release_date_iso",
        ),
    )
    _name_fields = [
        "anime_name_en",
        "anime_name_cn",
        "anime_name_roman",
        "anime_name_jp",
        "anime_name_alt",
    ]

    system_id = Column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True
    )
    franchise_id = Column(
        UUID(as_uuid=True),
        ForeignKey("franchise.system_id", ondelete="SET NULL"),
        nullable=True,
    )
    series_id = Column(
        UUID(as_uuid=True),
        ForeignKey("series.system_id", ondelete="SET NULL"),
        nullable=True,
    )

    anime_name_en = Column(String, nullable=True)
    anime_name_cn = Column(String, nullable=True)
    anime_name_roman = Column(String, nullable=True)
    anime_name_jp = Column(String, nullable=True)
    anime_name_alt = Column(String, nullable=True)

    season_part = Column(String, nullable=True)
    airing_type = Column(String, nullable=True)
    airing_status = Column(String, nullable=True)
    watching_status = Column(String, nullable=False, default="Might Watch")
    is_main = Column(String, nullable=True)
    is_main_entry = Column(Boolean, nullable=True)

    ep_previous = Column(Integer, nullable=True)
    ep_total = Column(Integer, nullable=True)
    ep_fin = Column(Integer, nullable=True, default=0)
    ep_special = Column(Float, nullable=True)

    my_rating = Column(String, nullable=True)
    mal_rating = Column(Float, nullable=True)
    mal_rank = Column(String, nullable=True)
    anilist_rating = Column(String, nullable=True)

    release_season = Column(String, nullable=True)
    release_date = Column(String, nullable=True)

    broadcast_day = Column(String, nullable=True)
    broadcast_time = Column(Time, nullable=True)
    my_watch_day = Column(String, nullable=True)

    mal_id = Column(Integer, nullable=True)
    mal_link = Column(String, nullable=True)

    seiyuu = Column(String, nullable=True)

    cover_image_file = Column(String, nullable=True)
    completed_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=get_taipei_now)
    updated_at = Column(DateTime, default=get_taipei_now, onupdate=get_taipei_now)

    # Relationships
    franchise = relationship(
        "Franchise", back_populates="animes", foreign_keys="[Anime.franchise_id]"
    )
    series = relationship("Series", back_populates="animes")

    @property
    def names_dict(self) -> dict:
        """Returns all name variations for hierarchy resolution."""
        return {
            "en": self.anime_name_en,
            "cn": self.anime_name_cn,
            "roman": self.anime_name_roman,
            "jp": self.anime_name_jp,
            "alt": self.anime_name_alt,
        }

    @property
    def display_name(self) -> str:
        sequence = [
            ("CN", self.anime_name_cn),
            ("EN", self.anime_name_en),
            ("Alt", self.anime_name_alt),
            ("roman", self.anime_name_roman),
            ("JP", self.anime_name_jp),
        ]
        return self.get_fallback_name(sequence, "CN")
