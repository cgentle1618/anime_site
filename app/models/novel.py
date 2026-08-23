"""Novel ORM model."""

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


class Novel(Base, NameFallbackMixin):
    """Light novel, web novel, and book entries."""

    __tablename__ = "novel"
    _name_fields = [
        "novel_name_en",
        "novel_name_cn",
        "novel_name_roman",
        "novel_name_jp",
        "novel_name_alt",
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

    novel_name_en = Column(String, nullable=True)
    novel_name_cn = Column(String, nullable=True)
    novel_name_roman = Column(String, nullable=True)
    novel_name_jp = Column(String, nullable=True)
    novel_name_alt = Column(String, nullable=True)
    novel_name_each_cn = Column(JSONB, default=None, nullable=True)
    novel_name_each_en = Column(JSONB, default=None, nullable=True)

    region = Column(String, nullable=True)
    type = Column(String, nullable=True)
    version = Column(String, nullable=True)
    is_main = Column(String, nullable=True)
    serialization_status = Column(String, nullable=True)
    reading_status = Column(String, nullable=False, default="Might Read")

    vol_total_original = Column(Float, nullable=True)
    vol_total_tw = Column(Float, nullable=True)
    vol_fin = Column(Float, nullable=False, default=0)
    arc_total = Column(Float, nullable=True)
    arc_fin = Column(Float, nullable=False, default=0)
    ch_total = Column(Float, nullable=True)
    ch_fin = Column(Float, nullable=False, default=0)
    progress_display = Column(String, nullable=True)

    my_rating = Column(String, nullable=True)
    mal_rating = Column(Float, nullable=True)
    mal_rank = Column(String, nullable=True)
    anilist_rating = Column(String, nullable=True)

    author = Column(String, nullable=True)
    illustrator = Column(String, nullable=True)
    release_year = Column(Integer, nullable=True)
    end_year = Column(Integer, nullable=True)
    publisher_tw = Column(String, nullable=True)

    is_main_entry = Column(Boolean, nullable=True)
    read_order = Column(Float, nullable=True)

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
            ("CN", self.novel_name_cn),
            ("EN", self.novel_name_en),
            ("Alt", self.novel_name_alt),
            ("roman", self.novel_name_roman),
            ("JP", self.novel_name_jp),
        ]
        return self.get_fallback_name(sequence, "CN")
