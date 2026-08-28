"""Cartoon request/response schemas."""

from datetime import datetime
from typing import List, Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, computed_field, field_validator

from app.schemas.release_date_field import release_date_validator


class CartoonBase(BaseModel):
    franchise_id: Optional[UUID] = None
    series_id: Optional[UUID] = None

    cartoon_name_en: Optional[str] = None
    cartoon_name_cn: Optional[str] = None
    cartoon_name_alt: Optional[str] = None

    season_part: Optional[str] = None
    source_official: Optional[str] = None
    airing_type: Optional[str] = None
    airing_status: Optional[str] = None
    watching_status: str = "Might Watch"
    is_main: Optional[str] = None

    ep_total: Optional[int] = None
    ep_fin: Optional[int] = 0
    length_ep_min: Optional[int] = None

    my_rating: Optional[str] = None
    imdb_rating: Optional[str] = None
    release_date: Optional[str] = None

    imdb_id: Optional[str] = None
    imdb_link: Optional[str] = None

    source_other: Optional[dict] = None

    watch_next: Optional[bool] = None
    to_rewatch: Optional[bool] = None
    remark: Optional[str] = None
    cover_image_file: Optional[str] = None
    completed_at: Optional[datetime] = None

    _validate_release_dates = release_date_validator("release_date")


class CartoonCreate(CartoonBase):
    pass


class CartoonUpdate(CartoonBase):
    pass


class CartoonResponse(CartoonBase):
    system_id: UUID
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)

    @computed_field
    @property
    def display_name(self) -> str:
        for val in (self.cartoon_name_cn, self.cartoon_name_en, self.cartoon_name_alt):
            if val and str(val).strip():
                return str(val).strip()
        return ""


class CartoonSheetSync(CartoonCreate):
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
