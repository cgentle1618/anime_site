"""Manga ORM model."""

import uuid
from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
)
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import relationship

from app.database import Base, get_taipei_now
from app.models.base import NameFallbackMixin


class Manga(Base, NameFallbackMixin):
    """Manga, manhwa, and manhua entries."""

    __tablename__ = "manga"
    _name_fields = [
        "manga_name_en",
        "manga_name_cn",
        "manga_name_roman",
        "manga_name_jp",
        "manga_name_alt",
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

    manga_name_en = Column(String, nullable=True)
    manga_name_cn = Column(String, nullable=True)
    manga_name_roman = Column(String, nullable=True)
    manga_name_jp = Column(String, nullable=True)
    manga_name_alt = Column(String, nullable=True)

    region = Column(String, nullable=True)
    is_main = Column(String, nullable=True)
    serialization_status = Column(String, nullable=True)
    reading_status = Column(String, nullable=False, default="Might Read")

    vol_total = Column(Integer, nullable=True)
    vol_fin = Column(Integer, nullable=False, default=0)
    vol_fin_page = Column(Integer, nullable=False, default=0)
    ch_total = Column(Integer, nullable=True)
    ch_fin = Column(Integer, nullable=False, default=0)

    my_rating = Column(String, nullable=True)
    mal_rating = Column(Float, nullable=True)
    mal_rank = Column(String, nullable=True)
    anilist_rating = Column(String, nullable=True)

    author_plot = Column(String, nullable=True)
    author_draw = Column(String, nullable=True)
    release_year = Column(String, nullable=True)
    end_year = Column(String, nullable=True)
    anime_studio = Column(String, nullable=True)
    serialization_platform = Column(String, nullable=True)
    publisher_tw = Column(String, nullable=True)

    mal_id = Column(Integer, nullable=True)
    mal_link = Column(String, nullable=True)
    anilist_link = Column(String, nullable=True)

    source_other = Column(JSONB, default=None, nullable=True)

    read_next = Column(Boolean, nullable=True)
    to_reread = Column(Boolean, default=False, nullable=True)
    cover_image_file = Column(String, nullable=True)
    created_at = Column(DateTime, default=get_taipei_now)
    updated_at = Column(DateTime, default=get_taipei_now, onupdate=get_taipei_now)
    completed_at = Column(DateTime, nullable=True)

    @property
    def display_name(self) -> str:
        sequence = [
            ("CN", self.manga_name_cn),
            ("EN", self.manga_name_en),
            ("Alt", self.manga_name_alt),
            ("roman", self.manga_name_roman),
            ("JP", self.manga_name_jp),
        ]
        return self.get_fallback_name(sequence, "CN")
