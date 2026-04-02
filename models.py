from sqlalchemy import (
    Boolean,
    Column,
    Integer,
    String,
    Float,
    ForeignKey,
    DateTime,
    Text,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from database import Base, get_taipei_now
import uuid

# ==========================================
# Application Data Models
# ==========================================


class Franchise(Base):
    """
    Top-level media franchise table.
    """

    __tablename__ = "franchise"

    system_id = Column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True
    )
    franchise_type = Column(String, nullable=True)
    franchise_name_en = Column(String, nullable=True)
    franchise_name_cn = Column(String, nullable=True)
    franchise_name_romanji = Column(String, nullable=True)
    franchise_name_jp = Column(String, nullable=True)
    franchise_name_alt = Column(String, nullable=True)
    my_rating = Column(String, nullable=True)
    franchise_expectation = Column(String, default="Low")
    favorite_3x3_slot = Column(Integer, nullable=True)
    remark = Column(Text, nullable=True)

    created_at = Column(DateTime, default=get_taipei_now)
    updated_at = Column(DateTime, default=get_taipei_now, onupdate=get_taipei_now)

    # Relationships
    series = relationship("Series", back_populates="franchise")
    animes = relationship("Anime", back_populates="franchise")

    # --- Data Control: Fallback Logic ---
    def get_fallback_name(self, start_from="CN"):
        """
        Cascading fallback for Franchise Name.
        Sequence: CN -> EN -> Alt -> Romanji -> JP -> hide ("")
        """
        sequence = [
            ("CN", self.franchise_name_cn),
            ("EN", self.franchise_name_en),
            ("Alt", self.franchise_name_alt),
            ("Romanji", self.franchise_name_romanji),
            ("JP", self.franchise_name_jp),
        ]

        # Determine where to start in the fallback chain
        start_idx = 0
        for i, (lang, _) in enumerate(sequence):
            if lang == start_from:
                start_idx = i
                break

        # Return the first non-empty string found from the starting point
        for i in range(start_idx, len(sequence)):
            val = sequence[i][1]
            if val and str(val).strip():
                return str(val).strip()
        return ""  # hide

    @property
    def display_name(self):
        """Convenience property for the default CN-first fallback."""
        return self.get_fallback_name("CN")


class Series(Base):
    """
    Intermediate series layer beneath Franchise and above Anime.
    """

    __tablename__ = "series"

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

    # Relationships
    franchise = relationship("Franchise", back_populates="series")
    animes = relationship("Anime", back_populates="series")

    # --- Data Control: Fallback Logic ---
    def get_fallback_name(self, start_from="CN"):
        """
        Cascading fallback for Series Name.
        Sequence: CN -> EN -> Alt -> hide ("")
        """
        sequence = [
            ("CN", self.series_name_cn),
            ("EN", self.series_name_en),
            ("Alt", self.series_name_alt),
        ]

        start_idx = 0
        for i, (lang, _) in enumerate(sequence):
            if lang == start_from:
                start_idx = i
                break

        for i in range(start_idx, len(sequence)):
            val = sequence[i][1]
            if val and str(val).strip():
                return str(val).strip()
        return ""

    @property
    def display_name(self):
        """Convenience property for the default CN-first fallback."""
        return self.get_fallback_name("CN")


class Anime(Base):
    """
    The individual anime entries.
    """

    __tablename__ = "anime"

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
    anime_name_romanji = Column(String, nullable=True)
    anime_name_jp = Column(String, nullable=True)
    anime_name_alt = Column(String, nullable=True)

    airing_type = Column(String, nullable=True)
    watching_status = Column(String, nullable=False, default="Might Watch")
    airing_status = Column(String, nullable=True)
    ep_total = Column(Integer, nullable=True)
    ep_fin = Column(Integer, nullable=True, default=0)
    my_rating = Column(String, nullable=True)
    is_main = Column(String, nullable=True)

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

    prequel_id = Column(UUID(as_uuid=True), nullable=True)
    sequel_id = Column(UUID(as_uuid=True), nullable=True)
    alternative = Column(String, nullable=True)
    watch_order = Column(Float, nullable=True)
    remark = Column(Text, nullable=True)

    official_link = Column(String, nullable=True)
    twitter_link = Column(String, nullable=True)

    mal_id = Column(Integer, nullable=True)
    mal_link = Column(String, nullable=True)
    mal_rating = Column(Float, nullable=True)
    mal_rank = Column(String, nullable=True)
    anilist_link = Column(String, nullable=True)
    anilist_rating = Column(String, nullable=True)

    op = Column(String, nullable=True)
    ed = Column(String, nullable=True)
    insert_ost = Column(String, nullable=True)
    seiyuu = Column(String, nullable=True)

    source_baha = Column(Boolean, default=None, nullable=True)
    baha_link = Column(String, nullable=True)
    source_other = Column(String, default=None, nullable=True)
    source_other_link = Column(String, nullable=True)
    source_netflix = Column(Boolean, default=False)

    cover_image_file = Column(String, nullable=True)

    created_at = Column(DateTime, default=get_taipei_now)
    updated_at = Column(DateTime, default=get_taipei_now, onupdate=get_taipei_now)

    # Relationships
    franchise = relationship("Franchise", back_populates="animes")
    series = relationship("Series", back_populates="animes")

    # --- Data Control: Fallback Logic ---
    def get_fallback_name(self, start_from="CN"):
        """
        Cascading fallback for Anime Name.
        Sequence: CN -> EN -> Alt -> Romanji -> JP -> hide ("")
        """
        sequence = [
            ("CN", self.anime_name_cn),
            ("EN", self.anime_name_en),
            ("Alt", self.anime_name_alt),
            ("Romanji", self.anime_name_romanji),
            ("JP", self.anime_name_jp),
        ]

        start_idx = 0
        for i, (lang, _) in enumerate(sequence):
            if lang == start_from:
                start_idx = i
                break

        for i in range(start_idx, len(sequence)):
            val = sequence[i][1]
            if val and str(val).strip():
                return str(val).strip()
        return ""

    @property
    def display_name(self):
        """Convenience property for the default CN-first fallback."""
        return self.get_fallback_name("CN")


# ==========================================
# System & Configuration Models
# ==========================================


class SystemOption(Base):
    """Stores dynamic dropdown options for the frontend (e.g., formats, statuses)."""

    __tablename__ = "system_options"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    category = Column(String, index=True, nullable=False)
    option_value = Column(String, nullable=False)


class User(Base):
    """Admin authentication users."""

    __tablename__ = "users"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    username = Column(String, unique=True, index=True)
    hashed_password = Column(String)
    role = Column(String, default="guest")
    created_at = Column(DateTime, default=get_taipei_now)


class SyncLog(Base):
    """Stores the audit trail of synchronization events."""

    __tablename__ = "sync_logs"

    id = Column(Integer, primary_key=True, index=True)
    timestamp = Column(DateTime, default=get_taipei_now)
    sync_type = Column(String)
    status = Column(String)
    rows_added = Column(Integer, default=0)
    rows_updated = Column(Integer, default=0)
    rows_deleted = Column(Integer, default=0)
    error_message = Column(Text, nullable=True)
    details_json = Column(Text, nullable=True)


class DeletedRecord(Base):
    """Stores a temporary history of permanently deleted items for recovery or sync purposes."""

    __tablename__ = "deleted_records"

    id = Column(Integer, primary_key=True, index=True)
    system_id = Column(String, index=True)
    table_name = Column(String)
    deleted_at = Column(DateTime, default=get_taipei_now)
    data_json = Column(Text, nullable=True)
