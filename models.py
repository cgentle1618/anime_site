"""
models.py
Defines the SQLAlchemy ORM models representing the physical tables in the PostgreSQL database.
"""

from sqlalchemy import Column, Integer, String, Float, DateTime, Text, Boolean
from database import Base, get_taipei_now
import uuid


class User(Base):
    """Represents a registered user (Admin/Guest) in the system."""

    __tablename__ = "users"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()), index=True)
    username = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=False)
    role = Column(String, default="admin")


class AnimeEntry(Base):
    """Represents a single anime season, movie, or OVA."""

    __tablename__ = "anime_entries"

    system_id = Column(String, primary_key=True, index=True)
    series_en = Column(String, index=True)
    series_season_en = Column(String)
    series_season_roman = Column(String)
    series_season_cn = Column(String)
    anime_alt_name = Column(String)
    series_season = Column(String)
    airing_type = Column(String)
    my_progress = Column(String)
    airing_status = Column(String)
    ep_total = Column(Integer)
    ep_fin = Column(Integer)
    rating_mine = Column(String)
    main_spinoff = Column(String)

    release_month = Column(String)
    release_season = Column(String)
    release_year = Column(String)

    studio = Column(String)
    director = Column(String)
    producer = Column(String)
    music = Column(String)
    distributor_tw = Column(String)
    genre_main = Column(String)
    genre_sub = Column(String)

    prequel = Column(String)
    sequel = Column(String)
    alternative = Column(String)
    watch_order = Column(Float)
    watch_order_rec = Column(String)
    remark = Column(String)

    mal_id = Column(String)
    mal_link = Column(String)
    mal_rating = Column(Float, nullable=True)  # <-- Added for Strong Sync
    mal_rank = Column(String, nullable=True)  # <-- Added for Strong Sync
    anilist_link = Column(String)

    op = Column(String)
    ed = Column(String)
    insert_ost = Column(String)
    seiyuu = Column(String)

    source_baha = Column(String)
    baha_link = Column(String, nullable=True)
    source_other = Column(String)
    source_other_link = Column(String)
    source_netflix = Column(Boolean, default=False)
    cover_image_file = Column(String)

    created_at = Column(DateTime, default=get_taipei_now)
    updated_at = Column(DateTime, default=get_taipei_now, onupdate=get_taipei_now)


class AnimeSeries(Base):
    """Represents a high-level Franchise Hub grouping multiple AnimeEntries."""

    __tablename__ = "anime_series"

    system_id = Column(String, primary_key=True, index=True)
    series_en = Column(String, index=True)
    series_roman = Column(String)
    series_cn = Column(String)
    rating_series = Column(String)
    series_alt_name = Column(String)
    series_expectation = Column(String)
    favorite_3x3_slot = Column(Integer)

    created_at = Column(DateTime, default=get_taipei_now)
    updated_at = Column(DateTime, default=get_taipei_now, onupdate=get_taipei_now)


class SyncLog(Base):
    """Stores the audit trail of synchronization events between Google Sheets and PostgreSQL."""

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


class SystemOption(Base):
    """Stores dynamic system options for dropdowns (Studio, Genre, etc.)"""

    __tablename__ = "system_options"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    category = Column(String, index=True)
    option_value = Column(String)
