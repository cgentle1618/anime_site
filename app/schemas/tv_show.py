"""TV Show request/response schemas."""

from datetime import datetime
from typing import List, Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, computed_field, field_validator


class TVShowBase(BaseModel):
    franchise_id: Optional[UUID] = None
    series_id: Optional[UUID] = None

    tv_name_en: Optional[str] = None
    tv_name_cn: Optional[str] = None
    tv_name_alt: Optional[str] = None

    region: Optional[str] = None
    season_part: Optional[str] = None
    source_official: Optional[str] = None
    airing_status: Optional[str] = None
    watching_status: str = "Might Watch"
    is_main: Optional[str] = None

    ep_total: Optional[int] = None
    ep_fin: Optional[int] = 0

    my_rating: Optional[str] = None
    imdb_rating: Optional[str] = None
    release_date: Optional[str] = None

    watch_order: Optional[float] = None

    imdb_id: Optional[str] = None
    imdb_link: Optional[str] = None

    source_other: Optional[dict] = None

    watch_next: Optional[bool] = None
    to_rewatch: Optional[bool] = None
    remark: Optional[str] = None
    cover_image_file: Optional[str] = None
    completed_at: Optional[datetime] = None


class TVShowCreate(TVShowBase):
    pass


class TVShowUpdate(TVShowBase):
    pass


class TVShowResponse(TVShowBase):
    system_id: UUID
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)

    @computed_field
    @property
    def display_name(self) -> str:
        for val in (self.tv_name_cn, self.tv_name_en, self.tv_name_alt):
            if val and str(val).strip():
                return str(val).strip()
        return ""


class TVShowSheetSync(TVShowCreate):
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
