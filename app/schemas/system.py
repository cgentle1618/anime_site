"""System-support schemas (options, config, seasonal, logs, deleted records)."""

import re
from datetime import date, datetime
from typing import Any, Dict, List, Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, field_validator

MAX_FIELD_COUNT = 200
# A default is a starting point, not a data import: no multi-select or repeater
# field is usefully pre-seeded with more rows than an admin would type by hand,
# so cap list values well below the payload size limit.
MAX_LIST_LENGTH = 50
MAX_FIELD_KEY_LENGTH = 64
_FIELD_KEY_RE = re.compile(r"^[a-z0-9_]+$")
# Far more currencies than a personal collection will ever be priced in,
# low enough that the config row stays a row.
MAX_FX_RATES = 40
_CURRENCY_RE = re.compile(r"^[A-Z]{3}$")


def _check_field_key(key: str) -> None:
    """Rejects form-field keys that could not have come from a form factory."""
    if len(key) > MAX_FIELD_KEY_LENGTH:
        raise ValueError(f"Field key '{key[:20]}...' is too long.")
    if not _FIELD_KEY_RE.match(key):
        raise ValueError(f"Invalid field key '{key}'.")


class SystemOptionAliasIO(BaseModel):
    """What one external source calls a vocabulary value."""

    source: str
    value: str


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

    # What external sources call this value. Unlike scopes and usages, an
    # empty list is not "everything" - it just means nothing maps to it.
    aliases: list[SystemOptionAliasIO] = []

    @field_validator("aliases")
    @classmethod
    def _known_sources(cls, v: list[SystemOptionAliasIO], info) -> list[SystemOptionAliasIO]:
        """
        Validate the category and source, and drop duplicate (source, value)
        pairs.

        The category check comes first because it is the wider rule: only the
        categories a pipeline actually reads may carry aliases at all. A row on
        any other category would sit in the table doing nothing forever, with
        nothing anywhere to say why - so opening one is a code change
        (ALIAS_CATEGORIES), not an admin action.

        A typo'd source is the mistake nothing downstream catches: the row
        saves happily and then never resolves, because Fill asks for the source
        by name. Deduping is not cosmetic either - the writes in
        routers/options.py insert these rows directly, so a repeated pair
        would trip uq_system_option_alias and 500 the whole save.

        `category` is read from info.data, which holds the fields validated
        before this one - it is declared on SystemOptionBase, so it is always
        there unless it failed its own validation, in which case the request is
        already rejected and this check is moot.
        """
        from app.utils.source_fields import ALIAS_CATEGORIES, ALIAS_SOURCES

        category = (info.data or {}).get("category")
        if v and category is not None and category not in ALIAS_CATEGORIES:
            raise ValueError(
                f"Category '{category}' does not carry aliases. "
                "Expected any of: " + ", ".join(ALIAS_CATEGORIES)
            )

        unknown = [a.source for a in v if a.source not in ALIAS_SOURCES]
        if unknown:
            raise ValueError(
                "Not alias sources: " + ", ".join(unknown)
                + ". Expected any of: " + ", ".join(ALIAS_SOURCES)
            )
        seen: set[tuple[str, str]] = set()
        unique: list[SystemOptionAliasIO] = []
        for alias in v:
            pair = (alias.source, alias.value)
            if pair not in seen:
                seen.add(pair)
                unique.append(alias)
        return unique


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

    aliases: list[SystemOptionAliasIO] = []

    @field_validator("aliases", mode="before")
    @classmethod
    def _flatten_aliases(cls, v):
        # ORM gives SystemOptionAlias rows; the contract is source/value pairs.
        if v and not isinstance(v[0], (dict, SystemOptionAliasIO)):
            return [{"source": a.source, "value": a.value} for a in v]
        return v



class SystemConfigResponse(BaseModel):
    config_key: str
    config_value: str

    model_config = ConfigDict(from_attributes=True)


class FxRatesBase(BaseModel):
    """
    The exchange rates the Statistics page converts game spend with.

    Hand-maintained, not fetched: a rate here is a number the owner typed on
    the day named by `as_of`, so the page prints that date beside every
    converted figure rather than implying the number is current.

    Stored as one JSON string in system_configs under the key 'fx_rates' -
    one key rather than one per currency, so `as_of` cannot drift out of
    sync with the numbers it describes.
    """

    # The currency every rate is expressed against. rates[base] must be 1.
    base: str
    # ISO date the rates were taken. Printed under the converted totals.
    as_of: str
    # currency code -> units of that currency per one unit of `base`.
    rates: Dict[str, float]

    @field_validator("base")
    @classmethod
    def _base_is_a_currency_code(cls, v: str) -> str:
        v = (v or "").strip().upper()
        if not _CURRENCY_RE.match(v):
            raise ValueError("base must be a three-letter currency code.")
        return v

    @field_validator("as_of")
    @classmethod
    def _as_of_is_an_iso_date(cls, v: str) -> str:
        v = (v or "").strip()
        try:
            date.fromisoformat(v)
        except ValueError:
            raise ValueError("as_of must be an ISO date (YYYY-MM-DD).") from None
        return v

    @field_validator("rates")
    @classmethod
    def _rates_are_positive_currency_codes(cls, v: Dict[str, float]) -> Dict[str, float]:
        if not v:
            raise ValueError("At least one rate is required.")
        if len(v) > MAX_FX_RATES:
            raise ValueError(f"No more than {MAX_FX_RATES} rates.")
        cleaned = {}
        for code, rate in v.items():
            code = (code or "").strip().upper()
            if not _CURRENCY_RE.match(code):
                raise ValueError(f"Invalid currency code '{code}'.")
            # A zero or negative rate is not a slow-burning data-quality
            # problem, it is a division by zero in the converter.
            if rate is None or rate <= 0:
                raise ValueError(f"Rate for {code} must be greater than zero.")
            cleaned[code] = float(rate)
        return cleaned


class FxRatesUpdate(FxRatesBase):
    pass


class FxRatesResponse(BaseModel):
    """
    Read side. Every field is optional because 'not configured yet' is a
    normal state the page has to render: it falls back to per-currency
    subtotals and prints no converted total at all, rather than converting
    with a rate it does not have.
    """

    base: Optional[str] = None
    as_of: Optional[str] = None
    rates: Dict[str, float] = {}


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
    stored as strings, multi-selects as string lists, repeater fields such as
    `sources` and game `copies` as lists of flat row objects). Field keys are
    validated for shape only — the authoritative key list lives in the JS form
    factories, and the frontend drops keys it does not recognize on read.
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
                # A list is one of two form-state shapes and never a blend of
                # them: a multi-select (all strings) or a repeater (all flat row
                # objects). Requiring the list to be uniform keeps the frontend
                # from having to guess which renderer a saved default belongs to.
                if len(value) > MAX_LIST_LENGTH:
                    raise ValueError(
                        f"List value for '{key}' cannot hold more than "
                        f"{MAX_LIST_LENGTH} items."
                    )
                if not (
                    all(isinstance(item, str) for item in value)
                    or all(isinstance(item, dict) for item in value)
                ):
                    raise ValueError(
                        f"List value for '{key}' must be all strings or all objects."
                    )
                for item in value:
                    if not isinstance(item, dict):
                        continue
                    # Repeater rows are one level deep — nesting would mean the
                    # value came from somewhere other than a form factory.
                    for row_key, row_value in item.items():
                        if not isinstance(row_key, str):
                            raise ValueError(
                                f"Object keys in '{key}' must be strings."
                            )
                        if not isinstance(
                            row_value, (str, int, float, bool)
                        ) and row_value is not None:
                            raise ValueError(
                                f"Value for '{row_key}' in '{key}' must be a scalar."
                            )
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
