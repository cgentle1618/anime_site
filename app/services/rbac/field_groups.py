"""
The vocabulary of gateable field groups.

Deliberately shaped like app/utils/credit_roles.py and note_sections.py: a
frozen dataclass per entry, a dict keyed by the value stored in
role_permission.permission, and a tuple of keys for validation.

A group is the unit an admin toggles on a role, so it is named for what a
reader would recognise ("Other Sources"), not for the storage behind it. That
storage comes in four flavours and they are gated in different places:

  columns       real columns on a media table. Stripped from a COPY of the
                response - nulling one on the live ORM instance would be
                flushed to disk. See field_gate.py.
  link_fields   credit/tag values derived at read time by
                services.domain.credits.attach_link_fields. Plain Python
                attrs since the 26 comma-joined columns were dropped, so they
                are simply not attached.
  note_sections rows in `note`, filtered in routers/note.py.
  ui_block      a block the SPA hides itself, because the server cannot strip
                what backs it. The permission travels to the browser in
                /api/auth/me and the block checks it. This is presentation,
                never a gate: system_info names the entry id printed on a
                detail page's spine, which is also that page's own URL, so
                hiding it tidies the page rather than concealing the value.
                A group may declare both - system_info withholds its
                timestamps for real and hides its spine text cosmetically.

tests/unit/test_field_groups.py asserts every declared name still exists.
"""

from dataclasses import dataclass, field

from app.services.domain.credits import legacy_link_fields
from app.utils.media_resolver import MEDIA_TYPE_KEYS

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
    # A frontend-only block, hidden by the SPA rather than stripped by the API.
    ui_block: str = ""


def _resolve(mapping: dict[str, tuple[str, ...]], media_type: str) -> tuple[str, ...]:
    return tuple(mapping.get(ALL, ())) + tuple(mapping.get(media_type, ()))


def columns_for(group: FieldGroup, media_type: str) -> tuple[str, ...]:
    """Real columns this group gates on one media type."""
    return _resolve(group.columns, media_type)


def link_fields_for(group: FieldGroup, media_type: str) -> tuple[str, ...]:
    """Derived link-field attributes this group gates on one media type."""
    return _resolve(group.link_fields, media_type)


def _credit_link_fields() -> dict[str, tuple[str, ...]]:
    """
    Every credit-kind link field, per media type, derived rather than listed.

    Tags are deliberately excluded: genre, era and publisher are content
    vocabulary that describes the work, while credits name people. Hand-listing
    these would be one more place to forget when a role is added, so they come
    from credit_roles through the same helper the response mixins use.

    `credit_refs` (every type) and `studio_refs` (anime and anime-movie) ride
    beside the legacy strings (see `attach_link_fields`) - they name the same
    credits, just shaped for linking, so a viewer withheld from the Credits
    group must lose them too. Neither has a credit_roles entry of its own, so
    both are added by hand rather than picked up by the `legacy_link_fields`
    scan above.
    """
    out = {
        media_type: tuple(
            attr
            for attr, kind, _key in legacy_link_fields(media_type)
            if kind == "credit"
        )
        for media_type in MEDIA_TYPE_KEYS
    }
    for media_type in out:
        out[media_type] = out[media_type] + ("credit_refs",)
    for media_type in ("anime", "anime-movie"):
        if media_type in out:
            out[media_type] = out[media_type] + ("studio_refs",)
    return out


FIELD_GROUPS: dict[str, FieldGroup] = {
    "sources_other": FieldGroup(
        key="sources_other",
        label="Other Sources",
        description="The free-form source_other links on every media entry.",
        columns={ALL: ("source_other",)},
        ui_block="info.SourcesCard.other",
    ),
    "personal_notes": FieldGroup(
        key="personal_notes",
        label="Personal Reviews",
        description="My own written assessment of an entry.",
        note_sections=("personal_reviews",),
        ui_block="notes.reviews.personal",
    ),
    "system_info": FieldGroup(
        key="system_info",
        label="System Info",
        description=(
            "When an entry was created and last edited, and the id printed "
            "down the spine of its detail page."
        ),
        # system_id is deliberately absent. It is the route parameter of the
        # page the viewer is already on - in the address bar, the cache key,
        # and every link out - so withholding it would break navigation while
        # concealing nothing. The spine text hides itself via ui_block, which
        # is presentation only and documented as such. The timestamps are in
        # no URL and nothing routes on them, so they can be withheld for real.
        columns={ALL: ("created_at", "updated_at")},
        ui_block="detail.SystemInfo",
    ),
    "credits": FieldGroup(
        key="credits",
        label="Credits",
        description="Studio, director and the other people credited on an entry.",
        link_fields=_credit_link_fields(),
        ui_block="info.CreditsCard",
    ),
}

FIELD_GROUP_KEYS: tuple[str, ...] = tuple(FIELD_GROUPS)
