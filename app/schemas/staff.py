"""Person and Studio request/response schemas."""

from typing import List, Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, field_validator, model_validator

from app.utils.credit_roles import PERSON_ROLES, legal_scopes


class PersonRoleIn(BaseModel):
    """
    One role a person is offered under, in one media type.

    Validated rather than free text because the frontend is now a routine
    writer of these strings: one typo'd `source.role` in a fieldMeta.js
    descriptor would otherwise mint a person holding a role no dropdown
    queries, invisible until someone wonders why a name they just typed is
    never suggested.

    scope is REQUIRED. Every person_role row carries one, because there is no
    "offered everywhere" state to fall back on - see the design spec's
    Decision B for why removing it is what makes auto-scoping on write safe.
    """

    role: str
    scope: str

    @field_validator("role")
    @classmethod
    def _known_role(cls, v: str) -> str:
        if v not in PERSON_ROLES:
            raise ValueError(
                f"'{v}' is not a person role. Expected one of: "
                + ", ".join(PERSON_ROLES)
            )
        return v

    @model_validator(mode="after")
    def _scope_is_legal_for_role(self):
        """
        Checked as a PAIR, not per field. A per-field validator cannot see the
        role, so it could never reject (composer, manga) - a scope that is a
        real media type but names a credit that does not exist.
        """
        allowed = legal_scopes(self.role)
        if self.scope not in allowed:
            raise ValueError(
                f"'{self.scope}' is not a scope for the {self.role} role. "
                "Expected one of: " + ", ".join(allowed)
            )
        return self


class PersonBase(BaseModel):
    name_native: str
    name_en: Optional[str] = None
    name_cn: Optional[str] = None
    gender: Optional[str] = None
    my_rating: Optional[str] = None
    photo_file: Optional[str] = None
    remark: Optional[str] = None


class PersonCreate(PersonBase):
    roles: List[PersonRoleIn] = []


class PersonUpdate(PersonBase):
    roles: List[PersonRoleIn] = []


class PersonResponse(PersonBase):
    system_id: UUID
    credit_count: int = 0

    model_config = ConfigDict(from_attributes=True)


class StudioBase(BaseModel):
    name_en: Optional[str] = None
    name_cn: Optional[str] = None
    name_jp: Optional[str] = None
    name_alt: Optional[str] = None
    display_name_field: Optional[str] = None
    my_rating: Optional[str] = None
    logo_file: Optional[str] = None
    remark: Optional[str] = None
    founded_date: Optional[str] = None
    defunct_date: Optional[str] = None
    country: Optional[str] = None
    website_url: Optional[str] = None
    mal_id: Optional[int] = None
    mal_link: Optional[str] = None

    @model_validator(mode="after")
    def at_least_one_name(self):
        """
        Mirrors ck_studio_has_a_name, so a nameless studio is a 422 from the
        API rather than a 500 surfacing the database's IntegrityError.
        """
        if not any(
            (self.name_en, self.name_cn, self.name_jp, self.name_alt)
        ):
            raise ValueError("A studio needs at least one name.")
        if self.display_name_field not in (None, "en", "cn", "jp", "alt"):
            raise ValueError("display_name_field must be en, cn, jp or alt.")
        return self


class StudioCreate(StudioBase):
    pass


class StudioUpdate(StudioBase):
    pass


class StudioResponse(StudioBase):
    system_id: UUID
    display_name: str = ""
    credit_count: int = 0

    model_config = ConfigDict(from_attributes=True)


class MergeRequest(BaseModel):
    source_id: UUID
