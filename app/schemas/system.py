"""System-support schemas (options, config, seasonal, logs, deleted records)."""

import re
from datetime import datetime
from typing import Any, Dict, List, Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, field_validator

MAX_FIELD_COUNT = 200
MAX_FIELD_KEY_LENGTH = 64
_FIELD_KEY_RE = re.compile(r"^[a-z0-9_]+$")


def _check_field_key(key: str) -> None:
    """Rejects form-field keys that could not have come from a form factory."""
    if len(key) > MAX_FIELD_KEY_LENGTH:
        raise ValueError(f"Field key '{key[:20]}...' is too long.")
    if not _FIELD_KEY_RE.match(key):
        raise ValueError(f"Invalid field key '{key}'.")


class SystemOptionBase(BaseModel):
    category: str
    value: str
    sort_order: int = 0
    remark: Optional[str] = None


class SystemOptionCreate(SystemOptionBase):
    # Media type keys (hyphenated) this value is offered in. Empty = everywhere.
    scopes: list[str] = []

    @field_validator("scopes")
    @classmethod
    def _known_scopes(cls, v: list[str]) -> list[str]:
        """
        Scopes are now the ONLY thing deciding where a value is offered
        (Ruling R27 removed the derive-on-save), so a typo here would hide a
        value from every dropdown with nothing to explain why. Validate, and
        drop duplicates while keeping the given order.
        """
        from app.utils.media_resolver import MEDIA_TYPE_KEYS

        unknown = [s for s in v if s not in MEDIA_TYPE_KEYS]
        if unknown:
            raise ValueError(
                "Not media type keys: "
                + ", ".join(unknown)
                + ". Expected any of: "
                + ", ".join(MEDIA_TYPE_KEYS)
            )
        return list(dict.fromkeys(v))

    # Roles this value may be used in. Empty = every usage.
    usages: list[str] = []

    @field_validator("usages")
    @classmethod
    def _known_usages(cls, v: list[str]) -> list[str]:
        from app.utils.source_fields import OPTION_USAGES

        unknown = [u for u in v if u not in OPTION_USAGES]
        if unknown:
            raise ValueError(
                "Not usages: " + ", ".join(unknown)
                + ". Expected any of: " + ", ".join(OPTION_USAGES)
            )
        return list(dict.fromkeys(v))


class SystemOptionResponse(SystemOptionBase):
    system_id: UUID
    scopes: list[str] = []

    model_config = ConfigDict(from_attributes=True)

    @field_validator("scopes", mode="before")
    @classmethod
    def _flatten_scopes(cls, v):
        # ORM gives SystemOptionScope rows; the API contract is plain strings.
        if v and not isinstance(v[0], str):
            return [s.scope for s in v]
        return v

    usages: list[str] = []

    @field_validator("usages", mode="before")
    @classmethod
    def _flatten_usages(cls, v):
        # ORM gives SystemOptionUsage rows; the API contract is plain strings.
        if v and not isinstance(v[0], str):
            return [u.usage for u in v]
        return v



class SystemConfigResponse(BaseModel):
    config_key: str
    config_value: str

    model_config = ConfigDict(from_attributes=True)


class AnnouncementBase(BaseModel):
    """Dashboard announcement note, stored in system_configs as 'announcement:<title>'."""

    title: str
    body: str


class AnnouncementCreate(AnnouncementBase):
    pass


class AnnouncementUpdate(AnnouncementBase):
    """Update payload — original_title identifies the row, title may rename it."""

    original_title: str


class AnnouncementResponse(AnnouncementBase):
    pass


class FormDefaultsPayload(BaseModel):
    """Admin-configured Add/Modify form behavior for one media type.

    Stored in system_configs as 'form_defaults:<media_type>'. `defaults` is a
    SPARSE per-field override map — an absent key means "use the frontend's
    built-in factory value". `autofill` is null-or-complete: null means "use the
    built-in autofill field list", while [] genuinely means "copy nothing".

    Values mirror FRONTEND FORM-STATE types, not DB column types (numbers are
    stored as strings, multi-selects as string lists). Field keys are validated
    for shape only — the authoritative key list lives in the JS form factories,
    and the frontend drops keys it does not recognize on read.
    """

    version: int = 1
    defaults: Dict[str, Any] = {}
    autofill: Optional[List[str]] = None

    @field_validator("defaults")
    @classmethod
    def _check_defaults(cls, v: Dict[str, Any]) -> Dict[str, Any]:
        if len(v) > MAX_FIELD_COUNT:
            raise ValueError(f"Cannot configure more than {MAX_FIELD_COUNT} fields.")
        for key, value in v.items():
            _check_field_key(key)
            if isinstance(value, list):
                if not all(isinstance(item, str) for item in value):
                    raise ValueError(f"List value for '{key}' must contain only strings.")
            elif not isinstance(value, (str, int, float, bool)) and value is not None:
                raise ValueError(f"Unsupported value type for field '{key}'.")
        return v

    @field_validator("autofill")
    @classmethod
    def _check_autofill(cls, v: Optional[List[str]]) -> Optional[List[str]]:
        if v is None:
            return v
        if len(v) > MAX_FIELD_COUNT:
            raise ValueError(f"Cannot autofill more than {MAX_FIELD_COUNT} fields.")
        for key in v:
            _check_field_key(key)
        return v


class FormDefaultsResponse(FormDefaultsPayload):
    media_type: str


class SeasonalBase(BaseModel):
    seasonal: str
    my_rating: Optional[str] = None
    entry_planned: int = 0
    entry_completed: int = 0
    entry_watching: int = 0
    entry_dropped: int = 0


class SeasonalResponse(SeasonalBase):
    model_config = ConfigDict(from_attributes=True)


class SeasonalUpdate(BaseModel):
    my_rating: Optional[str] = None


class CurrentSeasonUpdate(BaseModel):
    """Specific schema for updating global 'current_season' setting."""

    release_season: str
    release_year: int



class DataControlLogResponse(BaseModel):
    id: int
    action_main: str
    action_specific: str
    type: str
    status: str
    rows_added: int
    rows_updated: int
    rows_deleted: int
    error_message: Optional[str] = None
    details_json: Optional[str] = None
    timestamp: datetime

    model_config = ConfigDict(from_attributes=True)


class DeletedRecordResponse(BaseModel):
    id: int
    type: str
    name_cn: Optional[str] = None
    name_en: Optional[str] = None
    franchise_cn: Optional[str] = None
    franchise_type: Optional[str] = None
    series_cn: Optional[str] = None
    category: Optional[str] = None
    timestamp: datetime

    model_config = ConfigDict(from_attributes=True)
