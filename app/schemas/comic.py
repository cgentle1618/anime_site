"""Comic request/response schemas."""

from datetime import datetime
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, computed_field

from app.schemas.link_fields import ComicLinkFields
from app.schemas.release_date_field import release_date_validator


class ComicBase(BaseModel):
    franchise_id: Optional[UUID] = None
    series_id: Optional[UUID] = None

    comic_name_en: Optional[str] = None
    comic_name_cn: Optional[str] = None
    comic_name_alt: Optional[str] = None
    volume_label: Optional[str] = None

    comic_type: Optional[str] = None
    is_main_entry: Optional[bool] = None

    release_date: Optional[str] = None
    end_date: Optional[str] = None

    issue_total: Optional[int] = None
    issue_fin: int = 0
    serialization_status: Optional[str] = None
    reading_status: str = "Might Read"
    read_order: Optional[float] = None

    my_rating: Optional[str] = None

    comicvine_id: Optional[int] = None
    comicvine_link: Optional[str] = None

    source_other: Optional[dict] = None

    read_next: Optional[bool] = None
    to_reread: Optional[bool] = None
    remark: Optional[str] = None
    cover_image_file: Optional[str] = None
    completed_at: Optional[datetime] = None

    _validate_release_dates = release_date_validator("release_date", "end_date")


class ComicCreate(ComicBase):
    pass


class ComicUpdate(ComicBase):
    pass


class ComicResponse(ComicBase, ComicLinkFields):
    system_id: UUID
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)

    @computed_field
    @property
    def display_name(self) -> str:
        # EN first: Western comics are known by their English titles. Every
        # other entry type leads with CN.
        for val in (
            self.comic_name_en,
            self.comic_name_cn,
            self.comic_name_alt,
        ):
            if val and str(val).strip():
                return str(val).strip()
        return ""


class ComicSheetSync(ComicCreate):
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
