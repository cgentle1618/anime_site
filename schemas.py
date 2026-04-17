"""
schemas.py
Defines Pydantic models for request validation and response serialization.
Uses inheritance to maintain DRY principles across Create, Update, and Response states.
"""

from datetime import datetime
from typing import List, Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, computed_field


# ==========================================
# AUTHENTICATION SCHEMAS
# ==========================================


class Token(BaseModel):
    """Schema for the JWT access token returned on successful login."""

    access_token: str
    token_type: str


class UserBase(BaseModel):
    username: str


class UserCreate(UserBase):
    """Schema for creating a new user (requires plain text password)."""

    password: str


class UserOut(UserBase):
    """Schema for returning user data (excludes sensitive credentials)."""

    id: UUID
    role: str

    model_config = ConfigDict(from_attributes=True)


# ==========================================
# SYSTEM OPTION SCHEMAS
# ==========================================


class SystemOptionBase(BaseModel):
    category: str
    option_value: str


class SystemOptionCreate(SystemOptionBase):
    pass


class SystemOptionResponse(SystemOptionBase):
    id: int

    model_config = ConfigDict(from_attributes=True)


# ==========================================
# FRANCHISE SCHEMAS
# ==========================================


class FranchiseBase(BaseModel):
    franchise_type: Optional[str] = None
    franchise_name_en: Optional[str] = None
    franchise_name_cn: Optional[str] = None
    franchise_name_romanji: Optional[str] = None
    franchise_name_jp: Optional[str] = None
    franchise_name_alt: Optional[str] = None
    my_rating: Optional[str] = None
    franchise_expectation: Optional[str] = "Low"
    favorite_3x3_slot: Optional[int] = None
    cover_anime_id: Optional[UUID] = None
    watch_next_group: Optional[str] = None
    to_rewatch: Optional[bool] = None
    remark: Optional[str] = None


class FranchiseCreate(FranchiseBase):
    pass


class FranchiseUpdate(FranchiseBase):
    pass


class FranchiseResponse(FranchiseBase):
    system_id: UUID
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


# ==========================================
# SERIES SCHEMAS
# ==========================================


class SeriesBase(BaseModel):
    franchise_id: Optional[UUID] = None
    series_name_en: Optional[str] = None
    series_name_cn: Optional[str] = None
    series_name_alt: Optional[str] = None


class SeriesCreate(SeriesBase):
    pass


class SeriesUpdate(SeriesBase):
    pass


class SeriesResponse(SeriesBase):
    system_id: UUID

    model_config = ConfigDict(from_attributes=True)


# ==========================================
# ANIME SCHEMAS
# ==========================================


class AnimeBase(BaseModel):
    """
    Core schema for Anime entries.
    Field names must strictly match SQLAlchemy models for automated parsing.
    """

    franchise_id: Optional[UUID] = None
    series_id: Optional[UUID] = None

    anime_name_en: Optional[str] = None
    anime_name_cn: Optional[str] = None
    anime_name_romanji: Optional[str] = None
    anime_name_jp: Optional[str] = None
    anime_name_alt: Optional[str] = None

    season_part: Optional[str] = None
    airing_type: Optional[str] = None
    airing_status: Optional[str] = None
    watching_status: str = "Might Watch"
    is_main: Optional[str] = None

    ep_previous: Optional[int] = None
    ep_total: Optional[int] = None
    ep_fin: Optional[int] = 0
    ep_special: Optional[float] = None

    my_rating: Optional[str] = None
    mal_rating: Optional[float] = None
    mal_rank: Optional[str] = None
    anilist_rating: Optional[str] = None

    release_month: Optional[str] = None
    release_season: Optional[str] = None
    release_year: Optional[str] = None

    studio: Optional[str] = None
    director: Optional[str] = None
    producer: Optional[str] = None
    music: Optional[str] = None
    distributor_tw: Optional[str] = None
    genre_main: Optional[str] = None
    genre_sub: Optional[str] = None

    prequel_id: Optional[UUID] = None
    sequel_id: Optional[UUID] = None
    alternative: Optional[str] = None
    watch_order: Optional[float] = None

    mal_id: Optional[int] = None
    mal_link: Optional[str] = None
    anilist_link: Optional[str] = None
    official_link: Optional[str] = None
    twitter_link: Optional[str] = None

    op: Optional[str] = None
    ed: Optional[str] = None
    insert_ost: Optional[str] = None
    seiyuu: Optional[str] = None

    source_baha: Optional[bool] = None
    baha_link: Optional[str] = None
    source_netflix: bool = False
    source_other: Optional[str] = None
    source_other_link: Optional[str] = None
    remark: Optional[str] = None
    cover_image_file: Optional[str] = None
    completed_at: Optional[datetime] = None


class AnimeCreate(AnimeBase):
    pass


class AnimeUpdate(AnimeBase):
    pass


class AnimeResponse(AnimeBase):
    system_id: UUID
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)

    @computed_field
    @property
    def cum_ep_fin(self) -> int:
        """Dynamically calculates cumulative finished episodes."""
        prev = self.ep_previous or 0
        curr = self.ep_fin or 0
        return prev + curr

    @computed_field
    @property
    def cum_ep_total(self) -> int | None:
        """Dynamically calculates cumulative total episodes. Returns None if total is unknown."""
        prev = self.ep_previous or 0
        if self.ep_total is not None:
            return prev + self.ep_total
        return None


# ==========================================
# SYSTEM CONFIG & SEASONAL SCHEMAS
# ==========================================


class SystemConfigResponse(BaseModel):
    config_key: str
    config_value: str

    model_config = ConfigDict(from_attributes=True)


class SeasonalBase(BaseModel):
    seasonal: str
    my_rating: Optional[str] = None
    entry_completed: int = 0
    entry_watching: int = 0
    entry_dropped: int = 0


class SeasonalResponse(SeasonalBase):
    model_config = ConfigDict(from_attributes=True)


class SeasonalUpdate(BaseModel):
    my_rating: Optional[str] = None


class CurrentSeasonUpdate(BaseModel):
    """Specific schema for updating global 'current_season' setting."""

    release_season: str
    release_year: int


# ==========================================
# DATA CONTROL & SYNC SCHEMAS
# ==========================================


class FranchiseSheetSync(FranchiseCreate):
    """Schema for Google Sheets Franchise Sync operations, including timestamps."""

    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


class SeriesSheetSync(SeriesCreate):
    """Schema for Google Sheets Series Sync operations."""

    pass


class AnimeSheetSync(AnimeCreate):
    """Schema for Google Sheets Anime Sync operations, including timestamps."""

    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


class DataControlLogResponse(BaseModel):
    id: int
    action_main: str
    action_specific: str
    type: str
    status: str
    rows_added: int
    rows_updated: int
    rows_deleted: int
    error_message: Optional[str] = None
    details_json: Optional[str] = None
    timestamp: datetime

    model_config = ConfigDict(from_attributes=True)


class DeletedRecordResponse(BaseModel):
    id: int
    type: str
    franchise: Optional[str] = None
    series: Optional[str] = None
    anime_cn: Optional[str] = None
    anime_en: Optional[str] = None
    airing_type: Optional[str] = None
    timestamp: datetime

    model_config = ConfigDict(from_attributes=True)
