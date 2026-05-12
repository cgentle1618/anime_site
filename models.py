"""
models.py
Defines the SQLAlchemy ORM models for the CG1618 Database.
Contains core business models (Franchise, Series, Anime) and system support models.
"""

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

from database import Base, get_taipei_now

# ==========================================
# MIXINS & UTILITIES
# ==========================================


class NameFallbackMixin:
    """
    Mixin providing standardized multi-language fallback logic for display names.
    Ensures consistent UI presentation across different media levels.
    """

    _name_fields: list = []

    def get_fallback_name(self, sequence_keys: list, start_from: str = "CN") -> str:
        """
        Sequence: Iterate through provided fields and return the first non-empty value.
        """
        # Determine starting index based on preference
        start_idx = 0
        for i, (lang, _) in enumerate(sequence_keys):
            if lang == start_from:
                start_idx = i
                break

        # Return first non-empty string found from start point
        for i in range(start_idx, len(sequence_keys)):
            val = sequence_keys[i][1]
            if val and str(val).strip():
                return str(val).strip()
        return ""

    def get_all_names(self) -> set:
        return {
            getattr(self, f).strip().lower()
            for f in self._name_fields
            if getattr(self, f) and str(getattr(self, f)).strip()
        }


# ==========================================
# CORE APPLICATION DATA MODELS
# ==========================================


class Franchise(Base, NameFallbackMixin):
    """
    Top-level media franchise entity. Groups related series and individual entries.
    """

    __tablename__ = "franchise"
    _name_fields = [
        "franchise_name_en",
        "franchise_name_cn",
        "franchise_name_roman",
        "franchise_name_jp",
        "franchise_name_alt",
    ]

    system_id = Column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True
    )
    franchise_type = Column(String, nullable=True)
    franchise_name_en = Column(String, nullable=True)
    franchise_name_cn = Column(String, nullable=True)
    franchise_name_roman = Column(String, nullable=True)
    franchise_name_jp = Column(String, nullable=True)
    franchise_name_alt = Column(String, nullable=True)

    my_rating = Column(String, nullable=True)
    franchise_expectation = Column(String, default="Low")
    favorite_3x3_slot = Column(Integer, nullable=True)
    cover_anime_id = Column(
        UUID(as_uuid=True),
        ForeignKey("anime.system_id", ondelete="SET NULL"),
        nullable=True,
    )
    watch_next_group = Column(String, nullable=True)
    to_rewatch = Column(Boolean, default=False, nullable=True)
    remark = Column(Text, nullable=True)

    created_at = Column(DateTime, default=get_taipei_now)
    updated_at = Column(DateTime, default=get_taipei_now, onupdate=get_taipei_now)

    # Relationships
    series = relationship("Series", back_populates="franchise")
    animes = relationship(
        "Anime", back_populates="franchise", foreign_keys="[Anime.franchise_id]"
    )

    @property
    def display_name(self) -> str:
        sequence = [
            ("CN", self.franchise_name_cn),
            ("EN", self.franchise_name_en),
            ("Alt", self.franchise_name_alt),
            ("roman", self.franchise_name_roman),
            ("JP", self.franchise_name_jp),
        ]
        return self.get_fallback_name(sequence, "CN")


class Series(Base, NameFallbackMixin):
    """
    Intermediate grouping layer. Links individual anime entries to a parent Franchise.
    """

    __tablename__ = "series"
    _name_fields = ["series_name_en", "series_name_cn", "series_name_alt"]

    system_id = Column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True
    )
    franchise_id = Column(
        UUID(as_uuid=True),
        ForeignKey("franchise.system_id", ondelete="SET NULL"),
        nullable=True,
    )
    series_name_en = Column(String, nullable=True)
    series_name_cn = Column(String, nullable=True)
    series_name_alt = Column(String, nullable=True)
    remark = Column(Text, nullable=True)

    # Relationships
    franchise = relationship("Franchise", back_populates="series")
    animes = relationship("Anime", back_populates="series")

    @property
    def names_dict(self) -> dict:
        return {
            "en": self.series_name_en,
            "cn": self.series_name_cn,
            "alt": self.series_name_alt,
        }

    @property
    def display_name(self) -> str:
        sequence = [
            ("CN", self.series_name_cn),
            ("EN", self.series_name_en),
            ("Alt", self.series_name_alt),
        ]
        return self.get_fallback_name(sequence, "CN")


class Anime(Base, NameFallbackMixin):
    """
    The granular media entry. Contains all metadata for tracking, production, and sources.
    """

    __tablename__ = "anime"
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

    release_month = Column(String, nullable=True)
    release_season = Column(String, nullable=True)
    release_year = Column(String, nullable=True)

    studio = Column(String, nullable=True)
    director = Column(String, nullable=True)
    producer = Column(String, nullable=True)
    music = Column(String, nullable=True)
    distributor_tw = Column(String, nullable=True)
    genre_main = Column(String, nullable=True)
    genre_sub = Column(String, nullable=True)

    derive_related = Column(Boolean, nullable=True)
    prequel_id = Column(UUID(as_uuid=True), nullable=True)
    sequel_id = Column(UUID(as_uuid=True), nullable=True)
    alternative = Column(String, nullable=True)
    watch_order = Column(Float, nullable=True)

    mal_id = Column(Integer, nullable=True)
    mal_link = Column(String, nullable=True)
    anilist_link = Column(String, nullable=True)
    official_link = Column(String, nullable=True)
    twitter_link = Column(String, nullable=True)

    op = Column(String, nullable=True)
    ed = Column(String, nullable=True)
    insert_ost = Column(String, nullable=True)
    seiyuu = Column(String, nullable=True)

    source_baha = Column(Boolean, default=None, nullable=True)
    baha_link = Column(String, nullable=True)
    source_netflix = Column(Boolean, default=False)
    source_other = Column(JSONB, default=None, nullable=True)
    remark = Column(Text, nullable=True)
    notes = Column(JSONB, nullable=True)

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


class AnimeMovies(Base, NameFallbackMixin):
    """
    Standalone anime movie entries, distinct from the Anime table's series/OVA formats.
    """

    __tablename__ = "anime_movies"
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

    watch_next = Column(Boolean, nullable=True)
    to_rewatch = Column(Boolean, default=False, nullable=True)
    remark = Column(Text, nullable=True)
    notes = Column(JSONB, nullable=True)
    cover_image_file = Column(String, nullable=True)
    completed_at = Column(DateTime, nullable=True)
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


class TVShows(Base, NameFallbackMixin):
    """Live-action and scripted TV show entries."""

    __tablename__ = "tv_shows"
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
    source_official = Column(String, nullable=True)
    airing_status = Column(String, nullable=True)
    watching_status = Column(String, nullable=False, default="Might Watch")
    is_main = Column(String, nullable=True)

    ep_total = Column(Integer, nullable=True)
    ep_fin = Column(Integer, nullable=True, default=0)

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
    completed_at = Column(DateTime, nullable=True)
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
    completed_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=get_taipei_now)
    updated_at = Column(DateTime, default=get_taipei_now, onupdate=get_taipei_now)

    @property
    def display_name(self) -> str:
        sequence = [
            ("CN", self.cartoon_name_cn),
            ("EN", self.cartoon_name_en),
            ("Alt", self.cartoon_name_alt),
        ]
        return self.get_fallback_name(sequence, "CN")


class Movies(Base, NameFallbackMixin):
    """Live-action and animated movie entries."""

    __tablename__ = "movies"
    _name_fields = ["movie_name_en", "movie_name_cn", "movie_name_alt"]

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
    director = Column(String, nullable=True)

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
    completed_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=get_taipei_now)
    updated_at = Column(DateTime, default=get_taipei_now, onupdate=get_taipei_now)

    @property
    def display_name(self) -> str:
        sequence = [
            ("CN", self.movie_name_cn),
            ("EN", self.movie_name_en),
            ("Alt", self.movie_name_alt),
        ]
        return self.get_fallback_name(sequence, "CN")


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
    distributor_tw = Column(String, nullable=True)

    derive_related = Column(Boolean, nullable=True)
    prequel_id = Column(UUID(as_uuid=True), nullable=True)
    sequel_id = Column(UUID(as_uuid=True), nullable=True)
    watch_order = Column(Float, nullable=True)

    mal_id = Column(Integer, nullable=True)
    mal_link = Column(String, nullable=True)
    anilist_link = Column(String, nullable=True)

    source_other = Column(JSONB, default=None, nullable=True)

    read_next = Column(Boolean, nullable=True)
    to_reread = Column(Boolean, default=False, nullable=True)
    remark = Column(Text, nullable=True)
    notes = Column(JSONB, nullable=True)
    cover_image_file = Column(String, nullable=True)
    completed_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=get_taipei_now)
    updated_at = Column(DateTime, default=get_taipei_now, onupdate=get_taipei_now)

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

    prequel_id = Column(UUID(as_uuid=True), nullable=True)
    sequel_id = Column(UUID(as_uuid=True), nullable=True)
    alternative = Column(String, nullable=True)
    is_main_entry = Column(Boolean, nullable=True)
    read_order = Column(Float, nullable=True)

    mal_id = Column(Integer, nullable=True)
    mal_link = Column(String, nullable=True)
    anilist_link = Column(String, nullable=True)

    source_other = Column(JSONB, default=None, nullable=True)

    read_next = Column(Boolean, nullable=True)
    to_reread = Column(Boolean, default=False, nullable=True)
    remark = Column(Text, nullable=True)
    notes = Column(JSONB, nullable=True)
    cover_image_file = Column(String, nullable=True)
    completed_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=get_taipei_now)
    updated_at = Column(DateTime, default=get_taipei_now, onupdate=get_taipei_now)

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


# ==========================================
# SYSTEM & CONFIGURATION MODELS
# ==========================================


class SystemOption(Base):
    """Stores dynamic choice list values for the frontend dropdowns."""

    __tablename__ = "system_options"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    category = Column(String, index=True, nullable=False)
    option_value = Column(String, nullable=False)


class SystemConfigs(Base):
    """Stores persistent global application settings as key-value pairs."""

    __tablename__ = "system_configs"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    config_key = Column(String, unique=True, nullable=False, index=True)
    config_value = Column(String, nullable=False)


class Seasonal(Base):
    """Aggregates metrics for specific airing seasons."""

    __tablename__ = "seasonal"

    seasonal = Column(String, primary_key=True, unique=True, index=True)
    my_rating = Column(String, nullable=True)
    entry_planned = Column(Integer, nullable=False, default=0)
    entry_completed = Column(Integer, nullable=False, default=0)
    entry_watching = Column(Integer, nullable=False, default=0)
    entry_dropped = Column(Integer, nullable=False, default=0)


class User(Base):
    """Administrative user accounts for access control."""

    __tablename__ = "users"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    username = Column(String, nullable=False, unique=True, index=True)
    hashed_password = Column(String, nullable=False)
    role = Column(String, default="guest")


class DataControlLog(Base):
    """Audit log tracking the outcome of sync and maintenance pipelines."""

    __tablename__ = "data_control_logs"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    action_main = Column(String, nullable=False)
    action_specific = Column(String, nullable=False)
    type = Column(String, nullable=False)
    status = Column(String, nullable=False)
    rows_added = Column(Integer, default=0)
    rows_updated = Column(Integer, default=0)
    rows_deleted = Column(Integer, default=0)
    error_message = Column(Text, nullable=True)
    details_json = Column(Text, nullable=True)
    timestamp = Column(DateTime, default=get_taipei_now)


class DeletedRecord(Base):
    """Tombstone log capturing metadata of entries removed from the database."""

    __tablename__ = "deleted_record"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    type = Column(String, nullable=False)
    franchise_type = Column(String, nullable=True)
    franchise_cn = Column(String, nullable=True)
    series_cn = Column(String, nullable=True)
    category = Column(String, nullable=True)
    name_cn = Column(String, nullable=True)
    name_en = Column(String, nullable=True)

    timestamp = Column(DateTime, default=get_taipei_now)
