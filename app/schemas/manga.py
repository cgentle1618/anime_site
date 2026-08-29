"""Manga request/response schemas."""

from datetime import datetime
from typing import List, Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, computed_field, field_validator

from app.schemas.release_date_field import release_date_validator


class MangaBase(BaseModel):
    franchise_id: Optional[UUID] = None
    series_id: Optional[UUID] = None

    manga_name_en: Optional[str] = None
    manga_name_cn: Optional[str] = None
    manga_name_roman: Optional[str] = None
    manga_name_jp: Optional[str] = None
    manga_name_alt: Optional[str] = None

    region: Optional[str] = None
    is_main: Optional[str] = None
    serialization_status: Optional[str] = None
    reading_status: str = "Might Read"

    vol_total: Optional[int] = None
    vol_fin: int = 0
    vol_fin_page: int = 0
    ch_total: Optional[int] = None
    ch_fin: int = 0

    my_rating: Optional[str] = None
    mal_rating: Optional[float] = None
    mal_rank: Optional[str] = None
    anilist_rating: Optional[str] = None

    release_date: Optional[str] = None
    end_date: Optional[str] = None
    anime_studio: Optional[str] = None
    serialization_platform: Optional[str] = None

    mal_id: Optional[int] = None
    mal_link: Optional[str] = None
    anilist_link: Optional[str] = None

    source_other: Optional[dict] = None

    read_next: Optional[bool] = None
    to_reread: Optional[bool] = None
    remark: Optional[str] = None
    cover_image_file: Optional[str] = None
    completed_at: Optional[datetime] = None

    _validate_release_dates = release_date_validator("release_date", "end_date")


class MangaCreate(MangaBase):
    pass


class MangaUpdate(MangaBase):
    pass


class MangaResponse(MangaBase):
    system_id: UUID
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)

    @computed_field
    @property
    def display_name(self) -> str:
        for val in (
            self.manga_name_cn,
            self.manga_name_en,
            self.manga_name_alt,
            self.manga_name_roman,
            self.manga_name_jp,
        ):
            if val and str(val).strip():
                return str(val).strip()
        return ""


class MangaSheetSync(MangaCreate):
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
