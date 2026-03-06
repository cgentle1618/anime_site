"""
schemas.py
Defines Pydantic models for request validation and response serialization.
Following the DRY (Don't Repeat Yourself) principle with base classes.
"""

from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime

# ==========================================
# AUTHENTICATION SCHEMAS
# ==========================================


class Token(BaseModel):
    """Schema for the JWT access token returned on login."""

    access_token: str
    token_type: str


class UserBase(BaseModel):
    username: str


class UserCreate(UserBase):
    """Schema for creating a new user (requires plain text password)."""

    password: str


class UserOut(UserBase):
    """Schema for returning user data (never includes password!)."""

    id: str
    role: str

    class Config:
        from_attributes = True


# ==========================================
# BASE SCHEMAS (DRY Principle)
# ==========================================


class AnimeBase(BaseModel):
    """
    Shared fields for Anime creation, updating, and reading.
    By inheriting this base class, we avoid repeating these 30 fields
    across multiple different schemas.
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

    system_id: str
    mal_rating: Optional[float] = None
    mal_rank: Optional[str] = None
    cover_image_url: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class AnimeCreate(AnimeBase):
    """
    Schema for manually adding a new anime entry via the Admin Dashboard.
    Includes a temporary field to handle brand new Series Hub generation if the
    parent franchise does not yet exist.
    """

    system_id: str
    ep_fin: Optional[int] = 0
    series_alt_name: Optional[str] = None


class AnimeUpdate(AnimeBase):
    """
    Schema for updating an existing anime entry via the Admin Dashboard.
    The system_id is provided in the update payload to ensure strict schema
    validation against the Pydantic model.
    """

    system_id: str
    ep_fin: Optional[int] = 0


# ==========================================
# SERIES SCHEMAS
# ==========================================


class AnimeSeriesResponse(SeriesBase):
    """Schema for reading a series hub entry from the database."""

    system_id: str
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class AnimeSeriesUpdate(SeriesBase):
    """
    Schema for updating or manually creating an Anime Series Hub.
    Requires a system_id to maintain parity between Sheets and Database.
    """

    system_id: Optional[str] = None


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
