"""Anime request/response schemas."""

from datetime import datetime, time
from typing import List, Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, computed_field, field_validator


class AnimeBase(BaseModel):
    """
    Core schema for Anime entries.
    Field names must strictly match SQLAlchemy models for automated parsing.
    """

    franchise_id: Optional[UUID] = None
    series_id: Optional[UUID] = None

    anime_name_en: Optional[str] = None
    anime_name_cn: Optional[str] = None
    anime_name_roman: Optional[str] = None
    anime_name_jp: Optional[str] = None
    anime_name_alt: Optional[str] = None

    season_part: Optional[str] = None
    airing_type: Optional[str] = None
    airing_status: Optional[str] = None
    watching_status: str = "Might Watch"
    is_main: Optional[str] = None
    is_main_entry: Optional[bool] = None

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

    broadcast_day: Optional[str] = None
    broadcast_time: Optional[time] = None
    my_watch_day: Optional[str] = None

    studio: Optional[str] = None
    director: Optional[str] = None
    producer: Optional[str] = None
    music: Optional[str] = None
    distributor_tw: Optional[str] = None
    genre_main: Optional[str] = None
    genre_sub: Optional[str] = None

    derive_related: Optional[bool] = None
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
    source_netflix: Optional[bool] = False
    source_other: Optional[dict] = None
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



class AnimeSheetSync(AnimeCreate):
    """Schema for Google Sheets Anime Sync operations, including timestamps."""

    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
