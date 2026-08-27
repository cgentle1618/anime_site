"""
The vocabulary of `media_relation.relation_type`.

Ten user-facing labels compress to nine stored kinds, because Prequel is
Sequel read backwards. Storing both directions as distinct kinds would let one
fact exist as two rows that no unique index could catch, so `prequel` is
accepted on write and immediately normalized into a `sequel` row with the two
endpoints swapped.

Deliberately shaped like MEDIA_TABLES in app/utils/media_resolver.py: a frozen
dataclass per entry, a dict keyed by the value stored in the column, and a tuple
of keys for validation. Both are registries for cross-table facts and read the
same way on purpose.

This module is the single source of truth for the admin dropdown, the docs
table, and the inverse rendering. The frontend fetches it over HTTP
(GET /api/media-relation/kinds) rather than keeping a second copy.
"""

from dataclasses import dataclass


@dataclass(frozen=True)
class RelationKind:
    """One relation kind, read as `from` -> `to`."""

    # Value stored in media_relation.relation_type.
    key: str
    # How the relation reads on the `from` entry's page.
    label: str
    # How the same row reads on the `to` entry's page. Equal to `label` only
    # for a symmetric kind.
    inverse_label: str
    # One of RELATION_FAMILIES - how the admin page groups the rows.
    family: str
    # True when the relation means the same thing in both directions, which is
    # what lets the service sort the two endpoints before writing so that
    # A-alt-B and B-alt-A collapse to one row.
    symmetric: bool = False


RELATION_FAMILIES: tuple[str, ...] = (
    "timeline",
    "equivalence",
    "branch",
    "derivation",
)


RELATION_KINDS: dict[str, RelationKind] = {
    "sequel": RelationKind(
        "sequel", "Sequel", "Prequel", "timeline"
    ),
    "alternative": RelationKind(
        "alternative", "Alternative", "Alternative", "equivalence", symmetric=True
    ),
    # Renew, Director's Cut and Extended are all directional flavours of
    # "another version of the same work", so they share one inverse: whatever
    # they point at is the Original.
    "renew": RelationKind(
        "renew", "Renew", "Original", "equivalence"
    ),
    "directors_cut": RelationKind(
        "directors_cut", "Director's Cut", "Original", "equivalence"
    ),
    "extended": RelationKind(
        "extended", "Extended", "Original", "equivalence"
    ),
    "side_story": RelationKind(
        "side_story", "Side Story", "Parent Story", "branch"
    ),
    "spin_off": RelationKind(
        "spin_off", "Spin-off", "Main Story", "branch"
    ),
    # A companion volume about a work rather than a story in it: 設定集, 公式書,
    # 畫冊. It documents the main story and is never documented by it, so it is
    # directional, and it shares Spin-off's inverse for the same reason - what
    # it points at is the Main Story.
    "setting": RelationKind(
        "setting", "Setting", "Main Story", "branch"
    ),
    "adaptation": RelationKind(
        "adaptation", "Adaptation", "Source", "derivation"
    ),
}


RELATION_KEYS: tuple[str, ...] = tuple(RELATION_KINDS)

# The one kind the API accepts but never stores. Picking "Prequel" for B and
# choosing A writes the row A -sequel-> B.
INPUT_ONLY_KINDS: dict[str, str] = {"prequel": "sequel"}

# What POST /api/media-relation and PATCH will accept as `kind`: the nine
# stored kinds plus `prequel`, which is the ten choices the dropdown offers.
ACCEPTED_INPUT_KINDS: tuple[str, ...] = RELATION_KEYS + tuple(INPUT_ONLY_KINDS)
