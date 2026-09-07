"""Character request/response schemas."""

from typing import Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, model_validator

# MergeRequest is not redefined here - schemas.MergeRequest (app/schemas/staff.py)
# is the one shape {"source_id": UUID} and the character router reuses it.


class CharacterBase(BaseModel):
    name_en: Optional[str] = None
    name_cn: Optional[str] = None
    name_jp: Optional[str] = None
    name_alt: Optional[str] = None
    display_name_field: Optional[str] = None
    gender: Optional[str] = None
    my_rating: Optional[str] = None
    photo_file: Optional[str] = None
    remark: Optional[str] = None

    @model_validator(mode="after")
    def _display_field_is_known(self):
        if self.display_name_field not in (None, "en", "cn", "jp", "alt"):
            raise ValueError("display_name_field must be en, cn, jp or alt.")
        return self


def _has_a_name(payload: CharacterBase) -> bool:
    return any(
        (payload.name_en, payload.name_cn, payload.name_jp, payload.name_alt)
    )


class CharacterCreate(CharacterBase):
    """
    A character to create.

    Deliberately NO unslotted `name` field and NO `roles`, unlike PersonCreate:
    a character holds no roles, and there is no find-or-create path (see
    Decision G on the router) that would need name_slot_for to place an
    unslotted name into one of the four columns.
    """

    @model_validator(mode="after")
    def _at_least_one_name(self):
        """
        Mirrors ck_character_has_a_name, so a nameless character is a 422 from
        the API rather than a 500 surfacing the database's IntegrityError.
        """
        if not _has_a_name(self):
            raise ValueError("A character needs at least one name.")
        return self


class CharacterUpdate(CharacterBase):
    @model_validator(mode="after")
    def _at_least_one_name(self):
        """Mirrors ck_character_has_a_name; see CharacterCreate."""
        if not _has_a_name(self):
            raise ValueError("A character needs at least one name.")
        return self


class CharacterResponse(CharacterBase):
    system_id: UUID
    display_name: str = ""
    # Castings, not credits: this counts CharacterCasting rows, filtered
    # through the same visibility check the entries list uses, so the number
    # on the card and the list on the page can never disagree.
    casting_count: int = 0

    model_config = ConfigDict(from_attributes=True)
