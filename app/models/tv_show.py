"""TV Show ORM model."""

import uuid

from sqlalchemy import (
    CheckConstraint,
    Column,
    DateTime,
    ForeignKey,
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
        CheckConstraint(
            r"release_date ~ '^\d{4}(-\d{2}(-\d{2})?)?$'",
            name="ck_tv_shows_release_date_iso",
        ),
    )
    _name_fields = ["tv_name_en", "tv_name_cn", "tv_name_alt"]

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

    tv_name_en = Column(String, nullable=True)
    tv_name_cn = Column(String, nullable=True)
    tv_name_alt = Column(String, nullable=True)

    region = Column(String, nullable=True)
    season_part = Column(String, nullable=True)
    airing_status = Column(String, nullable=True)
    watching_status = Column(String, nullable=False, default="Might Watch")
    is_main = Column(String, nullable=True)

    ep_total = Column(Integer, nullable=True)
    ep_fin = Column(Integer, nullable=True, default=0)

    my_rating = Column(String, nullable=True)
    imdb_rating = Column(String, nullable=True)
    release_date = Column(String, nullable=True)

    imdb_id = Column(String, nullable=True)
    imdb_link = Column(String, nullable=True)

    cover_image_file = Column(String, nullable=True)
    created_at = Column(DateTime, default=get_taipei_now)
    updated_at = Column(DateTime, default=get_taipei_now, onupdate=get_taipei_now)
    completed_at = Column(DateTime, nullable=True)

    @property
    def display_name(self) -> str:
        sequence = [
            ("CN", self.tv_name_cn),
            ("EN", self.tv_name_en),
            ("Alt", self.tv_name_alt),
        ]
        return self.get_fallback_name(sequence, "CN")
