from sqlalchemy import Column, Integer, String, Float, Boolean, DateTime, Text
from database import Base, get_taipei_now


class AnimeEntry(Base):
    __tablename__ = "anime_entries"

    system_id = Column(String, primary_key=True, index=True)
    series_en = Column(String, index=True)
    series_season_en = Column(String)
    series_season_roman = Column(String)
    series_season_cn = Column(String)
    series_season = Column(String)
    airing_type = Column(String)
    my_progress = Column(String)
    airing_status = Column(String)
    ep_total = Column(Integer)
    ep_fin = Column(Integer)
    rating_mine = Column(String)
    main_spinoff = Column(String)
    release_date = Column(String)
    studio = Column(String)
    director = Column(String)
    producer = Column(String)
    distributor_tw = Column(String)
    genre_main = Column(String)
    genre_sub = Column(String)
    remark = Column(Text)
    mal_id = Column(Integer)
    mal_link = Column(String)
    mal_rating = Column(Float)
    mal_rank = Column(String)
    anilist_link = Column(String)
    op = Column(String)
    ed = Column(String)
    insert_ost = Column(String)
    seiyuu = Column(Text)
    source_baha = Column(String)
    source_netflix = Column(String)
    cover_image_url = Column(String)
    created_at = Column(DateTime, default=get_taipei_now)
    updated_at = Column(DateTime, default=get_taipei_now, onupdate=get_taipei_now)


class AnimeSeries(Base):
    __tablename__ = "anime_series"

    system_id = Column(String, primary_key=True, index=True)
    series_en = Column(String, index=True)
    series_roman = Column(String)
    series_cn = Column(String)
    rating_series = Column(String)
    alt_name = Column(String)
    created_at = Column(DateTime, default=get_taipei_now)
    updated_at = Column(DateTime, default=get_taipei_now, onupdate=get_taipei_now)


class SyncLog(Base):
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
    __tablename__ = "deleted_records"

    id = Column(Integer, primary_key=True, index=True)
    system_id = Column(String, index=True)
    record_type = Column(String)
    title = Column(String)
    deleted_at = Column(DateTime, default=get_taipei_now)
