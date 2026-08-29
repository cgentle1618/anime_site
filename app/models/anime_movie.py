"""Anime Movie ORM model."""

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
)
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import relationship

from app.database import Base, get_taipei_now
from app.models.base import NameFallbackMixin


class AnimeMovies(Base, NameFallbackMixin):
    """
    Standalone anime movie entries, distinct from the Anime table's series/OVA formats.
    """

    __tablename__ = "anime_movies"
    __table_args__ = (
        CheckConstraint(
            r"release_date_jp ~ '^\d{4}(-\d{2}(-\d{2})?)?$'",
            name="ck_anime_movies_release_date_jp_iso",
        ),
        CheckConstraint(
            r"release_date_tw ~ '^\d{4}(-\d{2}(-\d{2})?)?$'",
            name="ck_anime_movies_release_date_tw_iso",
        ),
    )
    _name_fields = [
        "anime_movie_name_en",
        "anime_movie_name_cn",
        "anime_movie_name_roman",
        "anime_movie_name_jp",
        "anime_movie_name_alt",
    ]

    system_id = Column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True
    )
    franchise_id = Column(
        UUID(as_uuid=True),
        ForeignKey("franchise.system_id", ondelete="SET NULL"),
        nullable=True,
    )

    anime_movie_name_en = Column(String, nullable=True)
    anime_movie_name_cn = Column(String, nullable=True)
    anime_movie_name_roman = Column(String, nullable=True)
    anime_movie_name_jp = Column(String, nullable=True)
    anime_movie_name_alt = Column(String, nullable=True)

    airing_status = Column(String, nullable=True)
    watching_status = Column(String, nullable=False, default="Might Watch")
    my_rating = Column(String, nullable=True)

    mal_rating = Column(Float, nullable=True)
    mal_rank = Column(String, nullable=True)
    anilist_rating = Column(String, nullable=True)

    length_min = Column(Integer, nullable=True)
    release_date_jp = Column(String, nullable=True)
    release_date_tw = Column(String, nullable=True)
    studio = Column(String, nullable=True)
    director = Column(String, nullable=True)

    mal_id = Column(Integer, nullable=True)
    mal_link = Column(String, nullable=True)
    anilist_link = Column(String, nullable=True)
    official_link = Column(String, nullable=True)
    twitter_link = Column(String, nullable=True)

    source_baha = Column(Boolean, default=None, nullable=True)
    baha_link = Column(String, nullable=True)
    source_netflix = Column(Boolean, default=False)
    source_other = Column(JSONB, default=None, nullable=True)

    cover_image_file = Column(String, nullable=True)
    created_at = Column(DateTime, default=get_taipei_now)
    updated_at = Column(DateTime, default=get_taipei_now, onupdate=get_taipei_now)
    completed_at = Column(DateTime, nullable=True)

    @property
    def names_dict(self) -> dict:
        """Returns all name variations for hierarchy resolution."""
        return {
            "en": self.anime_movie_name_en,
            "cn": self.anime_movie_name_cn,
            "roman": self.anime_movie_name_roman,
            "jp": self.anime_movie_name_jp,
            "alt": self.anime_movie_name_alt,
        }

    @property
    def display_name(self) -> str:
        sequence = [
            ("CN", self.anime_movie_name_cn),
            ("EN", self.anime_movie_name_en),
            ("Alt", self.anime_movie_name_alt),
            ("roman", self.anime_movie_name_roman),
            ("JP", self.anime_movie_name_jp),
        ]
        return self.get_fallback_name(sequence, "CN")
