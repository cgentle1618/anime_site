"""Novel request/response schemas."""

from datetime import datetime
from typing import List, Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, computed_field, field_validator


class NovelBase(BaseModel):
    franchise_id: Optional[UUID] = None
    series_id: Optional[UUID] = None

    novel_name_en: Optional[str] = None
    novel_name_cn: Optional[str] = None
    novel_name_roman: Optional[str] = None
    novel_name_jp: Optional[str] = None
    novel_name_alt: Optional[str] = None
    novel_name_each_cn: Optional[list] = None
    novel_name_each_en: Optional[list] = None

    @field_validator("novel_name_each_cn", "novel_name_each_en", mode="before")
    @classmethod
    def _coerce_each_to_list(cls, v):
        if isinstance(v, dict):
            return [{"key": k, "name": n} for k, n in v.items()]
        return v

    region: Optional[str] = None
    type: Optional[str] = None
    version: Optional[str] = None
    is_main: Optional[str] = None
    serialization_status: Optional[str] = None
    reading_status: str = "Might Read"

    vol_total_original: Optional[float] = None
    vol_total_tw: Optional[float] = None
    vol_fin: float = 0
    arc_total: Optional[float] = None
    arc_fin: float = 0
    ch_total: Optional[float] = None
    ch_fin: float = 0
    progress_display: Optional[str] = None

    my_rating: Optional[str] = None
    mal_rating: Optional[float] = None
    mal_rank: Optional[str] = None
    anilist_rating: Optional[str] = None

    author: Optional[str] = None
    illustrator: Optional[str] = None
    release_year: Optional[int] = None
    end_year: Optional[int] = None
    publisher_tw: Optional[str] = None

    prequel_id: Optional[UUID] = None
    sequel_id: Optional[UUID] = None
    alternative: Optional[str] = None
    is_main_entry: Optional[bool] = None
    read_order: Optional[float] = None

    mal_id: Optional[int] = None
    mal_link: Optional[str] = None
    anilist_link: Optional[str] = None

    source_other: Optional[dict] = None

    read_next: Optional[bool] = None
    to_reread: Optional[bool] = None
    remark: Optional[str] = None
    cover_image_file: Optional[str] = None
    completed_at: Optional[datetime] = None


class NovelCreate(NovelBase):
    pass


class NovelUpdate(NovelBase):
    pass


class NovelResponse(NovelBase):
    system_id: UUID
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)

    @computed_field
    @property
    def display_name(self) -> str:
        for val in (
            self.novel_name_cn,
            self.novel_name_en,
            self.novel_name_alt,
            self.novel_name_roman,
            self.novel_name_jp,
        ):
            if val and str(val).strip():
                return str(val).strip()
        return ""


class NovelSheetSync(NovelCreate):
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
