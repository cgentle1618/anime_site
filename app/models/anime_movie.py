"""Anime Movie ORM model."""

import uuid

from sqlalchemy import (
    CheckConstraint,
    Column,
    DateTime,
    Float,
    ForeignKeyConstraint,
    Integer,
    String,
)
from sqlalchemy.dialects.postgresql import UUID

from app.database import Base, get_taipei_now
from app.models.base import NameFallbackMixin


class AnimeMovies(Base, NameFallbackMixin):
    """
    Standalone anime movie entries, distinct from the Anime table's series/OVA formats.
    """

    __tablename__ = "anime_movies"
    __table_args__ = (
        # Pins this row to a media row of its own type: with media's
        # UNIQUE (system_id, media_type) on the other end, this table's row can
        # never attach itself to another type's media row.
        ForeignKeyConstraint(
            ["system_id", "media_type"],
            ["media.system_id", "media.media_type"],
            name="fk_anime_movies_media",
            ondelete="CASCADE",
            # Deferred because the parent row is written *after* this one: the
            # media row copies public_id, which a Sequence default does not
            # mint until this INSERT runs. Both rows land in one transaction
            # and the pairing is still checked, at COMMIT.
            deferrable=True,
            initially="DEFERRED",
        ),
        CheckConstraint("media_type = 'anime-movie'", name="ck_anime_movies_media_type"),
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
    # The discriminator half of the composite FK up to `media`. Constant per
    # table and pinned by ck_anime_movies_media_type; it exists so the FK can carry
    # the type, not because a row could ever be anything else.
    media_type = Column(String, nullable=False, server_default="anime-movie")

    anime_movie_name_en = Column(String, nullable=True)
    anime_movie_name_cn = Column(String, nullable=True)
    anime_movie_name_roman = Column(String, nullable=True)
    anime_movie_name_jp = Column(String, nullable=True)
    anime_movie_name_alt = Column(String, nullable=True)

    airing_status = Column(String, nullable=True)

    mal_rating = Column(Float, nullable=True)
    mal_rank = Column(String, nullable=True)
    # AniList's averageScore is an integer 0-100 and both ranks are
    # positions. mal_rank next door is a String for historical reasons; that
    # is not a reason to repeat it.
    anilist_rating = Column(Integer, nullable=True)
    anilist_rank = Column(Integer, nullable=True)
    anilist_popularity_rank = Column(Integer, nullable=True)

    length_min = Column(Integer, nullable=True)
    release_date_jp = Column(String, nullable=True)
    release_date_tw = Column(String, nullable=True)

    mal_id = Column(Integer, nullable=True)
    mal_link = Column(String, nullable=True)

    created_at = Column(DateTime, default=get_taipei_now)
    updated_at = Column(DateTime, default=get_taipei_now, onupdate=get_taipei_now)

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
