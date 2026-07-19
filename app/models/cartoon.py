"""Cartoon ORM model."""

import uuid
from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
)
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import relationship

from app.database import Base, get_taipei_now
from app.models.base import NameFallbackMixin


class Cartoon(Base, NameFallbackMixin):
    """Western animated TV show entries."""

    __tablename__ = "cartoons"
    _name_fields = ["cartoon_name_en", "cartoon_name_cn", "cartoon_name_alt"]

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

    cartoon_name_en = Column(String, nullable=True)
    cartoon_name_cn = Column(String, nullable=True)
    cartoon_name_alt = Column(String, nullable=True)

    season_part = Column(String, nullable=True)
    source_official = Column(String, nullable=True)
    airing_type = Column(String, nullable=True)
    airing_status = Column(String, nullable=True)
    watching_status = Column(String, nullable=False, default="Might Watch")
    is_main = Column(String, nullable=True)

    ep_total = Column(Integer, nullable=True)
    ep_fin = Column(Integer, nullable=True, default=0)
    length_ep_min = Column(Integer, nullable=True)

    my_rating = Column(String, nullable=True)
    imdb_rating = Column(String, nullable=True)
    release_date = Column(String, nullable=True)

    derive_related = Column(Boolean, nullable=True)
    prequel_id = Column(UUID(as_uuid=True), nullable=True)
    sequel_id = Column(UUID(as_uuid=True), nullable=True)
    watch_order = Column(Float, nullable=True)

    imdb_id = Column(String, nullable=True)
    imdb_link = Column(String, nullable=True)

    source_other = Column(JSONB, default=None, nullable=True)

    watch_next = Column(Boolean, nullable=True)
    to_rewatch = Column(Boolean, default=False, nullable=True)
    remark = Column(Text, nullable=True)
    notes = Column(JSONB, nullable=True)
    cover_image_file = Column(String, nullable=True)
    created_at = Column(DateTime, default=get_taipei_now)
    updated_at = Column(DateTime, default=get_taipei_now, onupdate=get_taipei_now)
    completed_at = Column(DateTime, nullable=True)

    @property
    def display_name(self) -> str:
        sequence = [
            ("CN", self.cartoon_name_cn),
            ("EN", self.cartoon_name_en),
            ("Alt", self.cartoon_name_alt),
        ]
        return self.get_fallback_name(sequence, "CN")
