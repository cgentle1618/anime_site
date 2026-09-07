"""Movie ORM model."""

import uuid

from sqlalchemy import (
    CheckConstraint,
    Column,
    DateTime,
    ForeignKey,
    Integer,
    Sequence,
    String,
)
from sqlalchemy.dialects.postgresql import UUID

from app.database import Base, get_taipei_now
from app.models.base import NameFallbackMixin


class Movies(Base, NameFallbackMixin):
    """Live-action and animated movie entries."""

    __tablename__ = "movies"
    __table_args__ = (
        CheckConstraint(
            r"release_date_usa ~ '^\d{4}(-\d{2}(-\d{2})?)?$'",
            name="ck_movies_release_date_usa_iso",
        ),
        CheckConstraint(
            r"release_date_tw ~ '^\d{4}(-\d{2}(-\d{2})?)?$'",
            name="ck_movies_release_date_tw_iso",
        ),
    )
    _name_fields = ["movie_name_en", "movie_name_cn", "movie_name_alt"]

    system_id = Column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True
    )
    # Short, stable, per-table id that appears in SPA URLs
    # (/anime/47/fullmetal-alchemist-brotherhood). The UUID stays the join key
    # and never leaves the API; this is the only id a human ever sees. Backed by
    # a sequence rather than a Python default so that every insert path - the
    # Add forms, Pull, Replace, a test fixture - gets one without knowing the
    # column exists.
    public_id = Column(
        Integer, Sequence("movies_public_id_seq"), nullable=False, unique=True
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

    movie_name_en = Column(String, nullable=True)
    movie_name_cn = Column(String, nullable=True)
    movie_name_alt = Column(String, nullable=True)

    airing_status = Column(String, nullable=True)
    watching_status = Column(String, nullable=False, default="Might Watch")
    my_rating = Column(String, nullable=True)
    imdb_rating = Column(String, nullable=True)
    movie_type = Column(String, nullable=True)
    is_main = Column(String, nullable=True)

    length_min = Column(Integer, nullable=True)
    release_date_usa = Column(String, nullable=True)
    release_date_tw = Column(String, nullable=True)

    imdb_id = Column(String, nullable=True)
    imdb_link = Column(String, nullable=True)

    cover_image_file = Column(String, nullable=True)
    created_at = Column(DateTime, default=get_taipei_now)
    updated_at = Column(DateTime, default=get_taipei_now, onupdate=get_taipei_now)
    completed_at = Column(DateTime, nullable=True)

    @property
    def display_name(self) -> str:
        sequence = [
            ("CN", self.movie_name_cn),
            ("EN", self.movie_name_en),
            ("Alt", self.movie_name_alt),
        ]
        return self.get_fallback_name(sequence, "CN")
