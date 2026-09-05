"""Novel request/response schemas."""

from datetime import datetime
from typing import List, Literal, Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, computed_field

from app.schemas.link_fields import NovelLinkFields
from app.schemas.release_date_field import release_date_validator
from app.schemas.sources import SourceWriteFields
from app.services.domain.novel_units import unit_display_key


class NovelUnitWrite(BaseModel):
    """
    One unit as the client sends it. system_id present means "update this
    row"; absent means "insert". Rows the payload omits are deleted — see
    write_novel_units.
    """

    system_id: Optional[UUID] = None
    unit_kind: Literal["volume", "arc", "story", "chapter"]
    position: float
    unit_key: Optional[str] = None
    name_cn: Optional[str] = None
    name_en: Optional[str] = None
    remark: Optional[str] = None
    ch_count: Optional[float] = None
    my_rating: Optional[str] = None


class NovelUnitResponse(BaseModel):
    system_id: UUID
    unit_kind: str
    position: float
    unit_key: Optional[str] = None
    name_cn: Optional[str] = None
    name_en: Optional[str] = None
    remark: Optional[str] = None
    ch_count: Optional[float] = None
    my_rating: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)

    @computed_field
    @property
    def display_key(self) -> str:
        return unit_display_key(self.unit_kind, self.position, self.unit_key)


class NovelBase(BaseModel):
    franchise_id: Optional[UUID] = None
    series_id: Optional[UUID] = None

    novel_name_en: Optional[str] = None
    novel_name_cn: Optional[str] = None
    novel_name_roman: Optional[str] = None
    novel_name_jp: Optional[str] = None
    novel_name_alt: Optional[str] = None

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
    ch_fin_in_arc: float = 0
    progress_display: Optional[str] = None

    my_rating: Optional[str] = None
    mal_rating: Optional[float] = None
    mal_rank: Optional[str] = None
    anilist_rating: Optional[str] = None

    release_date: Optional[str] = None
    end_date: Optional[str] = None

    is_main_entry: Optional[bool] = None
    read_order: Optional[float] = None

    mal_id: Optional[int] = None
    mal_link: Optional[str] = None
    anilist_link: Optional[str] = None
    openlibrary_link: Optional[str] = None
    openlibrary_id: Optional[str] = None

    source_other: Optional[dict] = None

    # Popped out of the payload by the router before the model is built;
    # see MediaTypeSpec.nested_collections.
    units: Optional[List[NovelUnitWrite]] = None

    read_next: Optional[bool] = None
    to_reread: Optional[bool] = None
    remark: Optional[str] = None
    cover_image_file: Optional[str] = None
    completed_at: Optional[datetime] = None

    _validate_release_dates = release_date_validator("release_date", "end_date")


class NovelCreate(NovelBase, SourceWriteFields):
    pass


class NovelUpdate(NovelBase, SourceWriteFields):
    pass


class NovelResponse(NovelBase, NovelLinkFields):
    system_id: UUID
    units: List[NovelUnitResponse] = []
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
