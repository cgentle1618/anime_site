"""
schemas.py
Defines Pydantic models for request validation and response serialization.
Following the DRY (Don't Repeat Yourself) principle with base classes.
"""

from pydantic import BaseModel, Field
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
# SYSTEM OPTION SCHEMAS
# ==========================================


class SystemOptionBase(BaseModel):
    """Base schema for dynamic system dropdown options."""

    category: str
    option_value: str


class SystemOptionCreate(SystemOptionBase):
    pass


class SystemOptionResponse(SystemOptionBase):
    id: int

    class Config:
        from_attributes = True


# ==========================================
# ANIME SERIES (HUB) SCHEMAS
# ==========================================


class AnimeSeriesBase(BaseModel):
    """Shared fields for Series (Franchise Hubs)."""

    series_en: Optional[str] = None
    series_roman: Optional[str] = None
    series_cn: Optional[str] = None
    rating_series: Optional[str] = None
    series_alt_name: Optional[str] = None  # Renamed for V2
    series_expectation: Optional[str] = None
    favorite_3x3_slot: Optional[int] = Field(None, ge=1, le=9)


class AnimeSeriesCreate(AnimeSeriesBase):
    pass


class AnimeSeriesUpdate(AnimeSeriesBase):
    """Schema for updating an Anime Series Hub."""

    system_id: Optional[str] = None


class AnimeSeriesResponse(AnimeSeriesBase):
    system_id: str
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


# ==========================================
# ANIME ENTRY (SEASONAL) SCHEMAS
# ==========================================


class AnimeBase(BaseModel):
    series_en: str
    series_season_en: Optional[str] = None
    series_season_roman: Optional[str] = None
    series_season_cn: Optional[str] = None
    anime_alt_name: Optional[str] = None

    series_season: Optional[str] = None
    airing_type: Optional[str] = None
    my_progress: Optional[str] = None
    airing_status: Optional[str] = None
    ep_total: Optional[int] = 0
    ep_fin: Optional[int] = 0
    rating_mine: Optional[str] = None
    main_spinoff: Optional[str] = "Main"

    release_month: Optional[str] = None
    release_season: Optional[str] = None
    release_year: Optional[str] = None

    # Missing Columns found in CSV / DB
    studio: Optional[str] = None
    director: Optional[str] = None
    producer: Optional[str] = None
    music: Optional[str] = None
    distributor_tw: Optional[str] = None

    genre_main: Optional[str] = None
    genre_sub: Optional[str] = None

    prequel: Optional[str] = None
    sequel: Optional[str] = None
    alternative: Optional[str] = None

    watch_order: Optional[float] = None
    watch_order_rec: Optional[str] = None
    remark: Optional[str] = None

    mal_id: Optional[int] = None
    mal_rating: Optional[float] = None
    mal_rank: Optional[int] = None
    mal_link: Optional[str] = None
    anilist_link: Optional[str] = None

    op: Optional[str] = None
    ed: Optional[str] = None
    insert_ost: Optional[str] = None
    seiyuu: Optional[str] = None

    source_baha: Optional[bool] = None
    baha_link: Optional[str] = None
    source_netflix: Optional[bool] = False
    source_other: Optional[str] = None
    source_other_link: Optional[str] = None
    cover_image_file: Optional[str] = None


class AnimeEntryCreate(AnimeBase):
    """Schema for adding a new Anime Entry (system_id is optional as it's usually generated)."""

    system_id: Optional[str] = None
    ep_fin: Optional[int] = 0
    series_alt_name: Optional[str] = None


class AnimeEntryUpdate(AnimeBase):
    """Schema for updating an existing entry."""

    system_id: Optional[str] = None


class AnimeEntryResponse(AnimeBase):
    system_id: str
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


# ==========================================
# ADMIN / LOGGING SCHEMAS
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
    table_name: str
    deleted_at: datetime
    data_json: Optional[str] = None

    class Config:
        from_attributes = True
