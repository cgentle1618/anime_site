from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime

# ==========================================
# BASE SCHEMAS
# ==========================================


class AnimeBase(BaseModel):
    """
    Shared fields for Anime creation, updating, and reading.
    By inheriting this base class, we avoid repeating these 30 fields
    across multiple different schemas.
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
    anilist_link: Optional[str] = None
    op: Optional[str] = None
    ed: Optional[str] = None
    insert_ost: Optional[str] = None
    seiyuu: Optional[str] = None
    source_baha: Optional[str] = None
    source_netflix: Optional[str] = None


class SeriesBase(BaseModel):
    """Shared fields for Series creation, updating, and reading."""

    system_id: str
    series_en: Optional[str] = None
    series_roman: Optional[str] = None
    series_cn: Optional[str] = None
    rating_series: Optional[str] = None
    alt_name: Optional[str] = None


# ==========================================
# ANIME ENTRY SCHEMAS
# ==========================================


class AnimeResponse(AnimeBase):
    """
    Schema for reading an anime entry from the database.
    Includes API-enriched fields and timestamps not present during manual creation.
    """

    mal_rating: Optional[float] = None
    mal_rank: Optional[str] = None
    cover_image_url: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True  # Allows Pydantic to read from SQLAlchemy ORM models


class AnimeCreate(AnimeBase):
    """
    Schema for manually adding a new anime entry via the Admin Dashboard.
    Includes a temporary field to handle brand new Series Hub generation.
    """

    ep_fin: Optional[int] = 0
    series_alt_name: Optional[str] = None  # Temp field for brand new series


class AnimeUpdate(AnimeBase):
    """
    Schema for updating an existing anime entry via the Admin Dashboard.
    System ID is strictly omitted because it is immutable.
    """

    ep_fin: Optional[int] = 0


# ==========================================
# SERIES SCHEMAS
# ==========================================


class AnimeSeriesResponse(SeriesBase):
    """Schema for reading a series hub entry from the database."""

    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class AnimeSeriesUpdate(SeriesBase):
    """Schema for updating an existing Anime Series entry."""

    pass  # Inherits all fields exactly as they are from SeriesBase


# ==========================================
# ADMIN / LOGGING SCHEMAS
# ==========================================


class SyncLogResponse(BaseModel):
    """Schema representing a single synchronization operation log."""

    id: int
    timestamp: datetime
    sync_type: str
    status: str
    rows_added: int
    rows_updated: int
    rows_deleted: int
    error_message: Optional[str] = None
    details_json: Optional[str] = None

    class Config:
        from_attributes = True


class PaginatedSyncLogResponse(BaseModel):
    """Wrapper schema for returning paginated sync logs with a total count."""

    total: int
    logs: List[SyncLogResponse]


class DeletedRecordResponse(BaseModel):
    """Schema for retrieving a history of permanently deleted items."""

    id: int
    system_id: str
    record_type: str
    title: str
    deleted_at: datetime

    class Config:
        from_attributes = True
