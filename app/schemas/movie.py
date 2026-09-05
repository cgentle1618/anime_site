"""Movie request/response schemas."""

from datetime import datetime
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, computed_field

from app.schemas.link_fields import MovieLinkFields
from app.schemas.release_date_field import release_date_validator
from app.schemas.sources import SourceWriteFields


class MovieBase(BaseModel):
    franchise_id: Optional[UUID] = None
    series_id: Optional[UUID] = None

    movie_name_en: Optional[str] = None
    movie_name_cn: Optional[str] = None
    movie_name_alt: Optional[str] = None

    airing_status: Optional[str] = None
    watching_status: str = "Might Watch"
    my_rating: Optional[str] = None
    imdb_rating: Optional[str] = None
    movie_type: Optional[str] = None
    is_main: Optional[str] = None

    length_min: Optional[int] = None
    release_date_usa: Optional[str] = None
    release_date_tw: Optional[str] = None

    imdb_id: Optional[str] = None
    imdb_link: Optional[str] = None

    watch_next: Optional[bool] = None
    to_rewatch: Optional[bool] = None
    remark: Optional[str] = None
    cover_image_file: Optional[str] = None
    completed_at: Optional[datetime] = None

    _validate_release_dates = release_date_validator("release_date_usa", "release_date_tw")


class MovieCreate(MovieBase, SourceWriteFields):
    pass


class MovieUpdate(MovieBase, SourceWriteFields):
    pass


class MovieResponse(MovieBase, MovieLinkFields):
    system_id: UUID
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)

    @computed_field
    @property
    def display_name(self) -> str:
        for val in (self.movie_name_cn, self.movie_name_en, self.movie_name_alt):
            if val and str(val).strip():
                return str(val).strip()
        return ""


class MovieSheetSync(MovieCreate):
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
