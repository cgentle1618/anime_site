"""
Stripping the field groups a viewer does not hold.

Two kinds of field, gated two different ways, because they are stored two
different ways:

  link fields   studio, director, the rest of the credit vocabulary. Since the
                26 comma-joined columns were dropped these are plain Python
                attributes that attach_link_fields sets on the instance, so
                blanking one in place is free and harmless.

  real columns  source_other, and anything added later. Nulling one on a live
                ORM instance marks the entity dirty, and the next autoflush
                would write the blank to disk - gating would become silent,
                permanent data loss. So the response is built from a COPY.

Both paths return the input untouched when the viewer holds everything, which
is the overwhelmingly common case and costs one set lookup.
"""

from typing import Any, Optional

from app.services.rbac.field_groups import (
    FIELD_GROUPS,
    columns_for,
    link_fields_for,
)
from app.services.rbac.permissions import field_group_perm
from app.services.rbac.resolver import Viewer


def _withheld(viewer: Optional[Viewer]):
    if viewer is None or viewer.is_superuser:
        return ()
    return tuple(
        group
        for group in FIELD_GROUPS.values()
        if not viewer.has(field_group_perm(group.key))
    )


def gated_columns(viewer: Optional[Viewer], media_type: str) -> tuple[str, ...]:
    """Real columns to strip from the response for this viewer."""
    out: list[str] = []
    for group in _withheld(viewer):
        out.extend(columns_for(group, media_type))
    return tuple(dict.fromkeys(out))


def gated_link_fields(viewer: Optional[Viewer], media_type: str) -> tuple[str, ...]:
    """Derived link-field attributes to blank for this viewer."""
    out: list[str] = []
    for group in _withheld(viewer):
        out.extend(link_fields_for(group, media_type))
    return tuple(dict.fromkeys(out))


def gate(
    viewer: Optional[Viewer],
    media_type: str,
    payload: Any,
    schema,
):
    """
    Apply both gates to one entry or a list of them.

    Returns ORM instances unchanged when nothing is withheld; otherwise returns
    schema instances, which FastAPI re-validates against the same
    response_model the route already declares.
    """
    columns = gated_columns(viewer, media_type)
    links = gated_link_fields(viewer, media_type)
    if not columns and not links:
        return payload

    is_list = isinstance(payload, list)
    entries = payload if is_list else [payload]

    # Link fields are not columns, so blanking them in place cannot be flushed.
    for entry in entries:
        for name in links:
            if hasattr(entry, name):
                setattr(entry, name, None)

    if not columns:
        return payload

    blanked = {name: None for name in columns}
    out = [
        schema.model_validate(entry).model_copy(update=blanked) for entry in entries
    ]
    return out if is_list else out[0]


def gated_note_sections(viewer: Optional[Viewer]) -> tuple[str, ...]:
    """
    note.section values to withhold. Not per media type: a section's owners are
    declared on the section itself, in note_sections.NOTE_SECTIONS.
    """
    out: list[str] = []
    for group in _withheld(viewer):
        out.extend(group.note_sections)
    return tuple(dict.fromkeys(out))
