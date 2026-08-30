"""Anime Movie request/response schemas."""

from datetime import datetime
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict

from app.schemas.link_fields import AnimeMovieLinkFields
from app.schemas.release_date_field import release_date_validator


class AnimeMovieBase(BaseModel):
    franchise_id: Optional[UUID] = None

    anime_movie_name_en: Optional[str] = None
    anime_movie_name_cn: Optional[str] = None
    anime_movie_name_roman: Optional[str] = None
    anime_movie_name_jp: Optional[str] = None
    anime_movie_name_alt: Optional[str] = None

    airing_status: Optional[str] = None
    watching_status: str = "Might Watch"
    my_rating: Optional[str] = None

    mal_rating: Optional[float] = None
    mal_rank: Optional[str] = None
    anilist_rating: Optional[str] = None

    length_min: Optional[int] = None
    release_date_jp: Optional[str] = None
    release_date_tw: Optional[str] = None

    mal_id: Optional[int] = None
    mal_link: Optional[str] = None
    anilist_link: Optional[str] = None
    official_link: Optional[str] = None
    twitter_link: Optional[str] = None

    source_baha: Optional[bool] = None
    baha_link: Optional[str] = None
    source_netflix: Optional[bool] = False
    source_other: Optional[dict] = None

    watch_next: Optional[bool] = None
    to_rewatch: Optional[bool] = None
    remark: Optional[str] = None
    cover_image_file: Optional[str] = None
    completed_at: Optional[datetime] = None

    _validate_release_dates = release_date_validator("release_date_jp", "release_date_tw")


class AnimeMovieCreate(AnimeMovieBase):
    pass


class AnimeMovieUpdate(AnimeMovieBase):
    pass


class AnimeMovieResponse(AnimeMovieBase, AnimeMovieLinkFields):
    system_id: UUID
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


class AnimeMovieSheetSync(AnimeMovieCreate):
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
