"""
The vocabulary of gateable field groups.

Deliberately shaped like app/utils/credit_roles.py and note_sections.py: a
frozen dataclass per entry, a dict keyed by the value stored in
role_permission.permission, and a tuple of keys for validation.

A group is the unit an admin toggles on a role, so it is named for what a
reader would recognise ("Other Sources"), not for the storage behind it. That
storage comes in five flavours and they are gated in different places:

  columns       real columns on a media table. Stripped from a COPY of the
                response - nulling one on the live ORM instance would be
                flushed to disk. See field_gate.py.
  link_fields   credit/tag values derived at read time by
                services.domain.credits.attach_link_fields. Plain Python
                attrs since the 26 comma-joined columns were dropped, so they
                are simply not attached.
  note_sections rows in `note`, filtered in routers/note.py.
  source_buckets  rows in `media_source`, filtered by
                  services.domain.sources.attach_sources before the response
                  is built.

There is deliberately no `ui_block` field. One used to name the SPA component
a group hides - "info.SourcesCard.other" - and read as a wiring mechanism in
this very docstring, but nothing in `app/` ever loaded it and nothing was
served from it: the SPA hides those blocks by checking the permission itself,
with the component named in JSX. A string that documents a mapping the code
does not make is worse than no string, because the next reader changes it and
expects something to happen.

tests/unit/test_field_groups.py asserts every declared name still exists.
"""

from dataclasses import dataclass, field

# Stands in for "every media type" in a columns / link_fields mapping.
ALL = "*"


@dataclass(frozen=True)
class FieldGroup:
    """One set of fields an admin can grant or withhold as a unit."""

    # Value stored in role_permission.permission, after the "field_group." prefix.
    key: str
    # Human label for the role editor.
    label: str
    description: str
    # media_type key (hyphenated) or ALL -> real column names.
    columns: dict[str, tuple[str, ...]] = field(default_factory=dict)
    # media_type key (hyphenated) or ALL -> derived link-field attributes.
    link_fields: dict[str, tuple[str, ...]] = field(default_factory=dict)
    # Keys in note_sections.NOTE_SECTIONS.
    note_sections: tuple[str, ...] = ()
    # Values in media_source.bucket to filter out of the composed source list.
    # Filtered at attach time rather than in field_gate.gate(): the gating is
    # partial - a viewer may hold `other` and not `restricted` - so the
    # attribute cannot simply be blanked.
    source_buckets: tuple[str, ...] = ()


def _resolve(mapping: dict[str, tuple[str, ...]], media_type: str) -> tuple[str, ...]:
    return tuple(mapping.get(ALL, ())) + tuple(mapping.get(media_type, ()))


def columns_for(group: FieldGroup, media_type: str) -> tuple[str, ...]:
    """Real columns this group gates on one media type."""
    return _resolve(group.columns, media_type)


def link_fields_for(group: FieldGroup, media_type: str) -> tuple[str, ...]:
    """Derived link-field attributes this group gates on one media type."""
    return _resolve(group.link_fields, media_type)


FIELD_GROUPS: dict[str, FieldGroup] = {
    "sources_other": FieldGroup(
        key="sources_other",
        label="Other Sources",
        description="The free-form source list on every media entry.",
        source_buckets=("other",),
    ),
    "sources_restricted": FieldGroup(
        key="sources_restricted",
        label="Restricted Sources",
        description="The restricted free-form source list on every media entry.",
        source_buckets=("restricted",),
    ),
    "personal_notes": FieldGroup(
        key="personal_notes",
        label="Personal Reviews",
        description="My own written assessment of an entry.",
        note_sections=("personal_reviews",),
    ),
}

FIELD_GROUP_KEYS: tuple[str, ...] = tuple(FIELD_GROUPS)
