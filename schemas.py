"""
schemas.py
Defines Pydantic models for request validation and response serialization.
Following the DRY (Don't Repeat Yourself) principle with base classes.
"""

from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime
from uuid import UUID

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

    id: UUID
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
# FRANCHISE SCHEMAS
# ==========================================


class FranchiseBase(BaseModel):
    """Base schema for top-level Franchise entries."""

    franchise_type: Optional[str] = None
    franchise_name_en: Optional[str] = None
    franchise_name_cn: Optional[str] = None
    franchise_name_romanji: Optional[str] = None
    franchise_name_jp: Optional[str] = None
    franchise_name_alt: Optional[str] = None
    my_rating: Optional[str] = None
    franchise_expectation: Optional[str] = "Low"
    favorite_3x3_slot: Optional[int] = None
    remark: Optional[str] = None


class FranchiseCreate(FranchiseBase):
    """Schema for creating a new Franchise."""

    pass


class FranchiseUpdate(FranchiseBase):
    """Schema for updating an existing Franchise. Allows passing the ID in the body."""

    system_id: Optional[UUID] = None


class FranchiseResponse(FranchiseBase):
    """Schema for returning Franchise data to the client."""

    system_id: UUID
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


# ==========================================
# SERIES SCHEMAS
# ==========================================


class SeriesBase(BaseModel):
    """Base schema for the intermediate Series layer."""

    franchise_id: Optional[UUID] = None
    series_name_en: Optional[str] = None
    series_name_cn: Optional[str] = None
    series_name_alt: Optional[str] = None


class SeriesCreate(SeriesBase):
    """Schema for creating a new Series."""

    pass


class SeriesUpdate(SeriesBase):
    """Schema for updating an existing Series."""

    system_id: Optional[UUID] = None


class SeriesResponse(SeriesBase):
    """Schema for returning Series data to the client."""

    system_id: UUID

    class Config:
        from_attributes = True


# ==========================================
# ANIME SCHEMAS
# ==========================================


class AnimeBase(BaseModel):
    """Base schema encompassing all editable fields for an Anime entry."""

    # Relationships
    franchise_id: Optional[UUID] = None
    series_id: Optional[UUID] = None

    # Naming
    anime_name_en: Optional[str] = None
    anime_name_cn: Optional[str] = None
    anime_name_romanji: Optional[str] = None
    anime_name_jp: Optional[str] = None
    anime_name_alt: Optional[str] = None

    # Progress & Status
    airing_type: Optional[str] = None
    watching_status: str = "Might Watch"
    airing_status: Optional[str] = None
    ep_total: Optional[int] = None
    ep_fin: Optional[int] = 0
    my_rating: Optional[str] = None
    is_main: Optional[str] = None

    # Release Information
    release_month: Optional[str] = None
    release_season: Optional[str] = None
    release_year: Optional[str] = None

    # Production
    studio: Optional[str] = None
    director: Optional[str] = None
    producer: Optional[str] = None
    music: Optional[str] = None
    distributor_tw: Optional[str] = None
    genre_main: Optional[str] = None
    genre_sub: Optional[str] = None

    # Ordering & Links
    prequel_id: Optional[UUID] = None
    sequel_id: Optional[UUID] = None
    alternative: Optional[str] = None
    watch_order: Optional[float] = None
    remark: Optional[str] = None

    # Official Links
    official_link: Optional[str] = None
    twitter_link: Optional[str] = None

    # External Databases
    mal_id: Optional[int] = None
    mal_link: Optional[str] = None
    mal_rating: Optional[float] = None
    mal_rank: Optional[str] = None
    anilist_link: Optional[str] = None
    anilist_rating: Optional[str] = None

    # Music & Cast
    op: Optional[str] = None
    ed: Optional[str] = None
    insert_ost: Optional[str] = None
    seiyuu: Optional[str] = None

    # Sources
    source_baha: Optional[bool] = None
    baha_link: Optional[str] = None
    source_other: Optional[str] = None
    source_other_link: Optional[str] = None
    source_netflix: Optional[bool] = False

    # Media
    cover_image_file: Optional[str] = None


class AnimeCreate(AnimeBase):
    """Schema for creating a new Anime entry."""

    pass


class AnimeUpdate(AnimeBase):
    """Schema for updating an existing Anime entry."""

    system_id: Optional[UUID] = None


class AnimeResponse(AnimeBase):
    """Schema for returning Anime data to the client."""

    system_id: UUID
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


# ==========================================
# ADMIN / LOGGING SCHEMAS
# ==========================================


class FranchiseSheetSync(FranchiseCreate):
    """Schema for Google Sheets Franchise Sync operations."""

    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


class SeriesSheetSync(SeriesCreate):
    """Schema for Google Sheets Series Sync operations."""

    # Series doesn't currently track created_at/updated_at in the model but we can extend if needed.
    pass


class AnimeSheetSync(AnimeCreate):
    """Schema for Google Sheets Anime Sync operations."""

    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


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
