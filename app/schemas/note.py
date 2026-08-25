"""Note request/response schemas, validated against the section registry."""

from datetime import datetime
from typing import List, Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict

from app.utils.media_resolver import OWNER_TABLES
from app.utils.note_sections import (
    SHAPE_EPISODE_TEXT,
    SHAPE_NAME_LINKS,
    SHAPE_TEXT_OR_LINK,
    STORED_SHAPES,
    NoteSection,
    kinds_for,
    label_for,
    locator_for,
    section_by_key,
    sections_for,
)


class NoteBase(BaseModel):
    owner_type: Optional[str] = None
    owner_id: Optional[UUID] = None
    section: Optional[str] = None
    locator: Optional[str] = None
    kind: Optional[str] = None
    title: Optional[str] = None
    content: Optional[str] = None
    links: Optional[List[str]] = None
    sort_index: Optional[float] = None


class NoteCreate(NoteBase):
    pass


class NoteUpdate(NoteBase):
    pass


class NoteResponse(NoteBase):
    system_id: UUID
    # Nullable in the database, and a blank Google Sheets cell parses to None
    # on Pull, so one timestamp-less row must not fail the whole list endpoint.
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


class NoteSectionOut(BaseModel):
    """One registry entry as the frontend needs it, resolved for one owner."""

    key: str
    shape: str
    label: str
    kinds: List[str] = []
    locator_placeholder: Optional[str] = None
    locator_required: bool = False
    singleton: bool = False
    desc_required: bool = False


class NoteReorder(BaseModel):
    """New ordering for one section of one owner."""

    owner_type: str
    owner_id: UUID
    section: str
    ordered_ids: List[UUID]


def section_out(section: NoteSection, owner_type: str) -> NoteSectionOut:
    """Resolve a registry entry for one owner type."""
    return NoteSectionOut(
        key=section.key,
        shape=section.shape,
        label=label_for(section, owner_type),
        kinds=list(kinds_for(section, owner_type)),
        locator_placeholder=locator_for(section, owner_type),
        locator_required=section.locator_required,
        singleton=section.singleton,
        desc_required=owner_type in section.desc_required,
    )


def sections_out(owner_type: str) -> List[NoteSectionOut]:
    """The whole registry for one owner type, in display order."""
    return [section_out(s, owner_type) for s in sections_for(owner_type)]


def validate_note_payload(payload: NoteBase) -> None:
    """
    Check one note against the registry.

    Raises ValueError, which the router turns into a 422. Singleton uniqueness
    is not checked here - it needs a database query, so the router owns it.
    """
    owner_type = payload.owner_type
    if owner_type not in OWNER_TABLES:
        raise ValueError(f"Unknown owner_type '{owner_type}'.")

    section = section_by_key(payload.section or "")
    if section is None:
        raise ValueError(f"Unknown note section '{payload.section}'.")

    if section.shape not in STORED_SHAPES:
        raise ValueError(
            f"Section '{section.key}' has its own table and is not stored as a note."
        )

    if owner_type not in section.owners:
        raise ValueError(
            f"Section '{section.key}' does not apply to owner type '{owner_type}'."
        )

    if payload.kind:
        allowed = kinds_for(section, owner_type)
        if not allowed:
            raise ValueError(
                f"Section '{section.key}' takes no kind for owner type "
                f"'{owner_type}'."
            )
        if payload.kind not in allowed:
            raise ValueError(
                f"'{payload.kind}' is not a valid kind for section '{section.key}'."
            )

    content = (payload.content or "").strip()
    if owner_type in section.desc_required and not content:
        raise ValueError(f"Section '{section.key}' requires content.")

    # Some sections are only about where they point: an OP/ED change or a
    # highlight with no episode names nothing.
    if section.locator_required and not (payload.locator or "").strip():
        raise ValueError(f"Section '{section.key}' requires a locator.")

    # A row with nothing in it is never worth storing. What counts as "nothing"
    # depends on the shape: a name_links row may carry only a title and a link,
    # and an episode_text row may carry only an episode.
    if section.shape == SHAPE_NAME_LINKS:
        if not content and not (payload.title or "").strip() and not payload.links:
            raise ValueError(f"Section '{section.key}' note is empty.")
    elif section.shape == SHAPE_TEXT_OR_LINK:
        links = [l for l in (payload.links or []) if l.strip()]
        if not content and not links:
            raise ValueError(f"Section '{section.key}' note is empty.")
        # The whole point of the shape: one row says one thing. A row carrying
        # both leaves no answer to "is this the review, or where to find it?".
        if content and links:
            raise ValueError(
                f"Section '{section.key}' takes text or a link, not both."
            )
        if len(links) > 1:
            raise ValueError(f"Section '{section.key}' takes one link per note.")
    elif section.shape == SHAPE_EPISODE_TEXT:
        if not content and not (payload.locator or "").strip():
            raise ValueError(f"Section '{section.key}' note is empty.")
    elif not content and not payload.links:
        raise ValueError(f"Section '{section.key}' note is empty.")
