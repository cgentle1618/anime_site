"""
models.py
Defines the SQLAlchemy ORM models representing the physical tables in the PostgreSQL database.
Perfectly aligned with the V2 CSV database exports and schemas.py.
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


class AnimeSeries(Base):
    """Represents a Series Hub that groups multiple entries/seasons together."""

    __tablename__ = "anime_series"

    system_id = Column(
        String, primary_key=True, default=lambda: str(uuid.uuid4()), index=True
    )
    series_en = Column(String, unique=True, index=True)
    series_roman = Column(String)
    series_cn = Column(String)
    rating_series = Column(String)
    series_alt_name = Column(String)
    series_expectation = Column(String)
    favorite_3x3_slot = Column(Integer, nullable=True)

    created_at = Column(DateTime, default=get_taipei_now)
    updated_at = Column(DateTime, default=get_taipei_now, onupdate=get_taipei_now)


class AnimeEntry(Base):
    """Represents a specific season, movie, or entry within an Anime Series."""

    __tablename__ = "anime_entries"

    system_id = Column(
        String, primary_key=True, default=lambda: str(uuid.uuid4()), index=True
    )
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
    ep_fin = Column(Integer, default=0)
    rating_mine = Column(String)
    main_spinoff = Column(String)

    release_month = Column(String, nullable=True)
    release_season = Column(String, nullable=True)
    release_year = Column(String, nullable=True)

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
    watch_order = Column(Float, nullable=True)
    watch_order_rec = Column(Float, nullable=True)
    remark = Column(Text)

    # External Stats
    mal_id = Column(Integer, nullable=True)
    mal_link = Column(String)
    mal_rating = Column(Float, nullable=True)
    mal_rank = Column(Integer, nullable=True)
    anilist_link = Column(String)

    # Music & Cast
    op = Column(String)
    ed = Column(String)
    insert_ost = Column(String)
    seiyuu = Column(String)

    # Streaming & Assets
    source_baha = Column(Boolean, nullable=True)
    baha_link = Column(String)
    source_other = Column(String)
    source_other_link = Column(String)
    source_netflix = Column(Boolean, nullable=True)
    cover_image_file = Column(String)

    created_at = Column(DateTime, default=get_taipei_now)
    updated_at = Column(DateTime, default=get_taipei_now, onupdate=get_taipei_now)


class SystemOption(Base):
    """Stores dynamic dropdown options for the frontend (e.g., formats, statuses)."""

    __tablename__ = "system_options"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    category = Column(String, index=True, nullable=False)
    option_value = Column(String, nullable=False)


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
