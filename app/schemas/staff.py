"""Person and Studio request/response schemas."""

from typing import List, Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, field_validator

from app.utils.credit_roles import PERSON_ROLES

# The two values person_role.scope may carry, plus NULL. Deliberately NOT the
# hyphenated media-type keys - director scope is anime vs non_anime, a
# coarser split than the eight media types.
PERSON_ROLE_SCOPES: frozenset[str] = frozenset({"anime", "non_anime"})


class PersonRoleIn(BaseModel):
    """
    One role a person is offered under.

    Validated rather than free text because the frontend is now a routine
    writer of these strings: one typo'd `source.role` in a fieldMeta.js
    descriptor would otherwise mint a person holding a role no dropdown
    queries, invisible until someone wonders why a name they just typed is
    never suggested.
    """

    role: str
    scope: Optional[str] = None

    @field_validator("role")
    @classmethod
    def _known_role(cls, v: str) -> str:
        if v not in PERSON_ROLES:
            raise ValueError(
                f"'{v}' is not a person role. Expected one of: "
                + ", ".join(PERSON_ROLES)
            )
        return v

    @field_validator("scope")
    @classmethod
    def _known_scope(cls, v: Optional[str]) -> Optional[str]:
        if v in (None, ""):
            return None
        if v not in PERSON_ROLE_SCOPES:
            raise ValueError(
                f"'{v}' is not a person role scope. Expected one of: "
                + ", ".join(sorted(PERSON_ROLE_SCOPES))
                + ", or null."
            )
        return v


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
    name_native: str
    name_en: Optional[str] = None
    name_cn: Optional[str] = None
    my_rating: Optional[str] = None
    logo_file: Optional[str] = None
    remark: Optional[str] = None


class StudioCreate(StudioBase):
    pass


class StudioUpdate(StudioBase):
    pass


class StudioResponse(StudioBase):
    system_id: UUID
    credit_count: int = 0

    model_config = ConfigDict(from_attributes=True)


class MergeRequest(BaseModel):
    source_id: UUID
