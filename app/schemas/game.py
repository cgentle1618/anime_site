"""Game request/response schemas."""

from datetime import datetime
from decimal import Decimal
from typing import List, Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, computed_field

from app.schemas.link_fields import GameLinkFields
from app.schemas.release_date_field import release_date_validator
from app.schemas.sources import SourceWriteFields
from app.services.domain.game_copies import derive_game_ownership


class GameCopyIO(BaseModel):
    """
    One copy row, in both directions.

    system_id present means "update this row"; absent means "insert". Rows the
    payload omits are deleted - the same contract write_novel_units uses.
    """

    system_id: Optional[UUID] = None
    storefront: Optional[str] = None
    ownership: Optional[str] = None
    copy_format: Optional[str] = None
    acquisition: Optional[str] = None
    price_paid: Optional[Decimal] = None
    price_currency: Optional[str] = None
    acquired_date: Optional[str] = None
    remark: Optional[str] = None
    position: Optional[int] = None

    model_config = ConfigDict(from_attributes=True)

    _validate_acquired_date = release_date_validator("acquired_date")


class GameBase(BaseModel):
    franchise_id: Optional[UUID] = None
    series_id: Optional[UUID] = None

    game_name_en: Optional[str] = None
    game_name_cn: Optional[str] = None
    game_name_roman: Optional[str] = None
    game_name_jp: Optional[str] = None
    game_name_alt: Optional[str] = None

    game_type: Optional[str] = None
    base_game_id: Optional[UUID] = None

    playing_status: str = "Might Play"
    completion_level: Optional[str] = None
    all_endings: Optional[bool] = None
    all_achievements: Optional[bool] = None
    all_collected: Optional[bool] = None
    steam_progress_sync: Optional[bool] = None
    achievements_earned: Optional[int] = None
    achievements_total: Optional[int] = None

    release_status: Optional[str] = None
    release_date: Optional[str] = None
    current_patch: Optional[str] = None

    hours_played: Optional[float] = None
    hltb_main: Optional[float] = None
    hltb_main_extra: Optional[float] = None
    hltb_completionist: Optional[float] = None

    price_original_us: Optional[Decimal] = None
    price_original_jp: Optional[Decimal] = None
    price_original_tw: Optional[Decimal] = None
    price_current_us: Optional[Decimal] = None
    price_current_jp: Optional[Decimal] = None
    price_current_tw: Optional[Decimal] = None

    # Critics out of 100, users out of 10 - see the model for why they are two
    # columns rather than one.
    metacritic_score: Optional[int] = None
    metacritic_user_score: Optional[float] = None

    my_rating: Optional[str] = None
    cover_image_file: Optional[str] = None

    igdb_id: Optional[int] = None
    igdb_link: Optional[str] = None
    steam_appid: Optional[int] = None
    steam_link: Optional[str] = None

    # Virtual: the router factory sets these from plan_next rows (see
    # PLAN_FLAG_FIELDS). Declared here so the response actually carries them -
    # an undeclared field is dropped without a word.
    play_next: Optional[bool] = None
    to_replay: Optional[bool] = None
    remark: Optional[str] = None
    completed_at: Optional[datetime] = None

    _validate_release_dates = release_date_validator("release_date")


class GameCreate(GameBase, SourceWriteFields):
    # None means "not supplied", [] means "clear them" - the contract
    # write_novel_units established for a nested collection.
    copies: Optional[List[GameCopyIO]] = None


class GameUpdate(GameBase, SourceWriteFields):
    copies: Optional[List[GameCopyIO]] = None


class GameResponse(GameBase, GameLinkFields):
    system_id: UUID
    # The id the SPA puts in the URL. Never gated: a viewer allowed to see the
    # entry must be able to link to it.
    public_id: int
    copies: List[GameCopyIO] = []
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)

    @computed_field
    @property
    def ownership(self) -> Optional[str]:
        """
        Derived from the copy rows, never stored.

        Computed here rather than attached by the router because `copies` is a
        real relationship: the factory selectinloads it on the list path and
        the ORM loads it on the detail path, so the rows are always present by
        the time the response is built.
        """
        return derive_game_ownership(self)

    @computed_field
    @property
    def display_name(self) -> str:
        for val in (
            self.game_name_cn,
            self.game_name_en,
            self.game_name_alt,
            self.game_name_roman,
            self.game_name_jp,
        ):
            if val and str(val).strip():
                return str(val).strip()
        return ""


class GameSheetSync(GameCreate):
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
