from pydantic import BaseModel
from typing import Optional
from datetime import datetime

# ==========================================
# ANIME ENTRY SCHEMAS
# ==========================================


class AnimeResponse(BaseModel):
    system_id: str
    series_en: Optional[str] = None
    series_season_en: Optional[str] = None
    series_season_roman: Optional[str] = None
    series_season_cn: Optional[str] = None
    series_season: Optional[str] = None
    airing_type: Optional[str] = None
    my_progress: Optional[str] = None
    airing_status: Optional[str] = None
    ep_total: Optional[int] = None
    ep_fin: Optional[int] = None
    rating_mine: Optional[str] = None
    main_spinoff: Optional[str] = None
    release_date: Optional[str] = None
    studio: Optional[str] = None
    director: Optional[str] = None
    producer: Optional[str] = None
    distributor_tw: Optional[str] = None
    genre_main: Optional[str] = None
    genre_sub: Optional[str] = None
    remark: Optional[str] = None
    mal_id: Optional[int] = None
    mal_link: Optional[str] = None
    mal_rating: Optional[float] = None
    mal_rank: Optional[str] = None
    anilist_link: Optional[str] = None
    op: Optional[str] = None
    ed: Optional[str] = None
    insert_ost: Optional[str] = None
    seiyuu: Optional[str] = None
    source_baha: Optional[str] = None
    source_netflix: Optional[str] = None
    cover_image_url: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


# ==========================================
# SERIES SCHEMAS
# ==========================================


class AnimeSeriesResponse(BaseModel):
    system_id: str
    series_en: Optional[str] = None
    series_roman: Optional[str] = None
    series_cn: Optional[str] = None
    rating_series: Optional[str] = None
    alt_name: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


# ==========================================
# ADMIN SCHEMAS
# ==========================================


class SyncLogResponse(BaseModel):
    id: int
    timestamp: datetime
    sync_type: str
    status: str
    rows_added: int
    rows_updated: int
    rows_deleted: int
    error_message: Optional[str] = None

    class Config:
        from_attributes = True  # Allows Pydantic to read from SQLAlchemy ORM models


class MalOverrideRequest(BaseModel):
    mal_id: int


class AnimeManualCreate(BaseModel):
    """
    Schema for manually adding a new anime entry via the Admin Dashboard.
    Contains all matching columns mapped from the Google Sheet.
    """

    system_id: str
    series_en: Optional[str] = None
    series_season_en: Optional[str] = None
    series_season_roman: Optional[str] = None
    series_season_cn: Optional[str] = None
    series_season: Optional[str] = None
    airing_type: Optional[str] = None
    my_progress: Optional[str] = None
    airing_status: Optional[str] = None
    ep_total: Optional[int] = None
    ep_fin: Optional[int] = 0
    rating_mine: Optional[str] = None
    main_spinoff: Optional[str] = None
    release_date: Optional[str] = None
    studio: Optional[str] = None
    director: Optional[str] = None
    producer: Optional[str] = None
    distributor_tw: Optional[str] = None
    genre_main: Optional[str] = None
    genre_sub: Optional[str] = None
    remark: Optional[str] = None
    mal_id: Optional[int] = None
    mal_link: Optional[str] = None
    anilist_link: Optional[str] = None
    op: Optional[str] = None
    ed: Optional[str] = None
    insert_ost: Optional[str] = None
    seiyuu: Optional[str] = None
    source_baha: Optional[str] = None
    source_netflix: Optional[str] = None

    # NEW: Temporary field to hold the alt_name if a brand new series is detected
    series_alt_name: Optional[str] = None


class AnimeManualUpdate(BaseModel):
    """
    Schema for updating an existing anime entry via the Admin Dashboard.
    System ID is omitted because it is strictly unchangeable.
    """

    series_en: Optional[str] = None
    series_season_en: Optional[str] = None
    series_season_roman: Optional[str] = None
    series_season_cn: Optional[str] = None
    series_season: Optional[str] = None
    airing_type: Optional[str] = None
    my_progress: Optional[str] = None
    airing_status: Optional[str] = None
    ep_total: Optional[int] = None
    ep_fin: Optional[int] = 0
    rating_mine: Optional[str] = None
    main_spinoff: Optional[str] = None
    release_date: Optional[str] = None
    studio: Optional[str] = None
    director: Optional[str] = None
    producer: Optional[str] = None
    distributor_tw: Optional[str] = None
    genre_main: Optional[str] = None
    genre_sub: Optional[str] = None
    remark: Optional[str] = None
    mal_id: Optional[int] = None
    mal_link: Optional[str] = None
    anilist_link: Optional[str] = None
    op: Optional[str] = None
    ed: Optional[str] = None
    insert_ost: Optional[str] = None
    seiyuu: Optional[str] = None
    source_baha: Optional[str] = None
    source_netflix: Optional[str] = None


class AnimeSeriesUpdate(BaseModel):
    """
    Schema for updating an existing Anime Series entry.
    """

    series_en: Optional[str] = None
    series_roman: Optional[str] = None
    series_cn: Optional[str] = None
    rating_series: Optional[str] = None
    alt_name: Optional[str] = None
