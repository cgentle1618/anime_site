"""
Find local rows the Google Sheet no longer mentions, and delete the ones an
admin ticks.

Pull is upsert-only - execute_pull_specific inserts and updates, and nothing in
pull.py deletes - so an entry deleted on one machine survives every Pull All on
the other, forever. This is the action that makes deletions propagate.

Read pull.py's identity rules before changing anything here, and then do NOT
copy them. They were written for an upsert, where a failed match merely inserts
a duplicate that somebody can see and fix. Here a failed match DELETES, and the
foreign keys cascade it into credits, sources, notes, quotes and every user's
list rows. An identity rule borrowed from an upsert path has to be re-derived
before it gates a delete; see Decision 3b in the spec.

Spec: docs/superpowers/specs/2026-09-11-clean-orphaned-data-design.md
"""

from dataclasses import dataclass, field

from app.services.integrations.sheets import (
    SheetsUnavailableError,
    get_all_raw_rows,
)

# The thirteen tabs in scope, in scan order: the three grouping tiers, the entry
# spine, then the nine detail tabs.
#
# Everything else in SHEET_TABS is deliberately absent (Decision 2). The
# vocabulary and entity tabs (System Options, Person, Studio, Publisher,
# Character) are excluded because deleting one of those rows does not remove a
# row the operator reviewed - it silently rewrites every entry citing it,
# through ON DELETE CASCADE on media_credit and media_tag. The authorization
# tabs (Users, Content Label, Media Content Label) are excluded because the
# sheet is an ordinary Google Sheet anyone with access can edit, and a delete
# path into Users would let a sheet edit remove an account. The per-user tabs
# are excluded because those rows belong to somebody.
CLEAN_TABS: tuple[str, ...] = (
    "Collection",
    "Franchise",
    "Series",
    "Media",
    "Anime",
    "Anime Movie",
    "Movies",
    "TV Shows",
    "Cartoons",
    "Manga",
    "Novel",
    "Comic",
    "Game",
)


class CleanAborted(RuntimeError):
    """
    The sheet cannot be trusted as the authority for a DELETE, so the whole run
    stops - not the current tab, the run.

    Pull's policy for both of the conditions below is to continue and report.
    That is right for an upsert and catastrophic here:

    - An unreadable tab is indistinguishable from "every local row that tab
      covers is orphaned". Continuing past one would offer the entire contents
      of that table for deletion.
    - An empty tab means "delete this entire table". bulk_overwrite_sheet
      already refuses to WRITE an empty tab (it raises ValueError rather than
      blank one), so reading one back means something upstream is wrong, never
      that the table should be emptied.
    """


def read_tab(tab_name: str) -> list[list[str]]:
    """
    One tab's raw rows, or CleanAborted.

    Never returns an empty or partial read: the two failure modes this guards
    are the only two that end in deleting the whole database.
    """
    try:
        rows = get_all_raw_rows(tab_name)
    except SheetsUnavailableError as exc:
        raise CleanAborted(
            f"Could not read the '{tab_name}' tab, so the scan cannot tell "
            f"orphaned rows from unread ones. Nothing was deleted. ({exc})"
        ) from exc

    if len(rows) < 2:
        raise CleanAborted(
            f"The '{tab_name}' tab has no data rows. Backup refuses to write an "
            "empty tab, so this means the sheet is wrong, not that the table "
            "should be emptied. Nothing was deleted."
        )

    return rows


def _s(value) -> str:
    """
    One spelling for both sides of a comparison.

    public_id is an Integer column locally and text in the sheet, so a bare
    `==` between them is always False - which would make every entry in the
    database look orphaned at once.
    """
    return "" if value is None else str(value).strip()


@dataclass(frozen=True)
class SheetIndex:
    """Every identity one tab's rows carry, as lookup sets."""

    ids: set[str] = field(default_factory=set)
    pairs: set[tuple[str, str]] = field(default_factory=set)
    names: set[str] = field(default_factory=set)


def index_tab(rows: list[list[str]]) -> SheetIndex:
    """
    Index one tab BY HEADER NAME.

    Never by position: Backup appends the credit and tag link columns after the
    plain ones, so a column's index moves whenever a media type gains a role.
    Pull matches by header name for the same reason.

    Tabs that do not carry a given column simply contribute nothing to that
    set - the tier tabs have no media_type or public_id, and that is not an
    error.
    """
    headers = [_s(h) for h in rows[0]]
    col = {name: i for i, name in enumerate(headers)}

    def cell(row: list[str], name: str) -> str:
        i = col.get(name)
        # A trailing empty cell is simply absent from the row Sheets returns.
        return _s(row[i]) if i is not None and i < len(row) else ""

    ids: set[str] = set()
    pairs: set[tuple[str, str]] = set()
    names: set[str] = set()

    for row in rows[1:]:
        if not any(_s(c) for c in row):
            continue
        if sid := cell(row, "system_id"):
            ids.add(sid)
        media_type, public_id = cell(row, "media_type"), cell(row, "public_id")
        if media_type and public_id:
            pairs.add((media_type, public_id))
        if name := cell(row, "display_name"):
            names.add(name)

    return SheetIndex(ids=ids, pairs=pairs, names=names)


def is_orphan_media(row, index: SheetIndex) -> bool:
    """
    True only when the sheet knows this media row by NONE of its identities.

    Any single hit spares the row. The arms are not equally strong, and it is
    worth being honest about which is which:

    - system_id       - exact, but a row re-created on the other machine has a
                        different one.
    - (media_type,
       public_id)     - the load-bearing arm. Backup writes public_id on every
                        entity tab and Pull restores it UNCHANGED; that is what
                        keeps the two machines agreeing on the ids that appear
                        in URLs, and it is why the uniqueness constraint is
                        DEFERRABLE INITIALLY DEFERRED. user_media_list already
                        resolves entries across machines by exactly this pair.
    - display_name    - the weak arm, and NOT independent of a name match:
                        media.display_name is denormalized from the detail
                        table's *_name_* columns (see domain/display_name.py).
                        A rename changes it. It is here to catch a row
                        re-created locally with a fresh id and a fresh
                        public_id, not to carry the rule.

    So: two robust arms and one weak one. A rename kills only the weak arm,
    which is precisely the case a names-only rule got wrong - see Decision 3b.
    """
    if _s(row.system_id) in index.ids:
        return False
    if (_s(row.media_type), _s(row.public_id)) in index.pairs:
        return False
    # An empty local name must not match an empty sheet cell: two rows both
    # missing a name are not thereby the same row.
    if (name := _s(row.display_name)) and name in index.names:
        return False
    return True


# What points at a media row, split by what the DATABASE does to it when that
# row is deleted. Both halves are read off the models, not assumed: every entry
# here is a real ForeignKey("media.system_id", ...) with the ondelete shown.
#
# The split matters to the operator, not just to us. Reporting a quote as
# "will be deleted" would be false - it survives, detached - and the review
# screen is the one place where being precise about this is the whole point.
_CASCADED = (
    ("credits", "MediaCredit"),
    ("tags", "MediaTag"),
    ("sources", "MediaSource"),
    ("content_labels", "MediaContentLabel"),
    ("notes", "Note"),
    ("memes", "Meme"),
    # Somebody else's status, rating and progress. Counted with the rest but
    # named apart in the UI: it is the only collateral that is not the
    # operator's own.
    ("list_rows", "UserMediaList"),
)

# ON DELETE SET NULL, not CASCADE. quote.media_id is explicitly nullable
# because "a quote may belong to no entry, either because it was written that
# way or because its entry was later deleted" (app/models/quote.py).
_DETACHED = (("quotes", "Quote"),)


def blast_radius(db, media_row) -> dict[str, dict[str, int]]:
    """
    What deleting this media row costs, split into rows the database will
    DELETE and rows it will merely DETACH.

    Computed before anything is deleted, because ticking a box must never
    remove something the operator was not shown. Decision 5.
    """
    from app import models

    media_id = media_row.system_id

    def count(model_name: str) -> int:
        model = getattr(models, model_name)
        return db.query(model).filter(model.media_id == media_id).count()

    return {
        "deleted": {key: count(name) for key, name in _CASCADED},
        "detached": {key: count(name) for key, name in _DETACHED},
    }
