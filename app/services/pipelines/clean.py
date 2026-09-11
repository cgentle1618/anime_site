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
    # Tier tabs carry no media_type, so they have no portable pair and
    # public_id has to stand on its own for them.
    public_ids: set[str] = field(default_factory=set)


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
    public_ids: set[str] = set()

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
        # A tab with public_id but no media_type is a tier tab.
        if public_id and not media_type:
            public_ids.add(public_id)
        # Tier tabs name themselves with an irregular prefix, so take any
        # *_name_en / *_name_cn header rather than guessing which one.
        for header in headers:
            if header.endswith("_name_en") or header.endswith("_name_cn"):
                if value := cell(row, header):
                    names.add(value)

    return SheetIndex(ids=ids, pairs=pairs, names=names, public_ids=public_ids)


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


# Tier tab -> (models attribute, column prefix). Every prefix here was read off
# the model rather than derived from the tab name: this codebase has nine entry
# prefixes and one of them is `tv_`, not `tv_show_`.
_TIER_TABS: tuple[tuple[str, str, str], ...] = (
    ("Collection", "Collection", "collection"),
    ("Franchise", "Franchise", "franchise"),
    ("Series", "Series", "series"),
)


def _is_orphan_tier(row, prefix: str, index: SheetIndex) -> bool:
    """
    The tier equivalent of is_orphan_media, and equally reluctant.

    Tier tabs carry no media_type, so the portable (media_type, public_id) pair
    is unavailable and public_id has to stand on its own. That makes this rule
    weaker than the entry one, and it is why the name arms matter more here
    than they do for entries.
    """
    if _s(row.system_id) in index.ids:
        return False
    if (pid := _s(row.public_id)) and pid in index.public_ids:
        return False
    for field_name in (prefix + "_name_en", prefix + "_name_cn"):
        if (name := _s(getattr(row, field_name, None))) and name in index.names:
            return False
    return True


def _last_backup_at(db) -> str | None:
    """
    When the sheet was last known to match this database.

    Only a SUCCESSFUL Backup counts. A failed run wrote nothing, so counting it
    would overstate how fresh the sheet is - and the review screen's whole
    staleness story rests on this one number.
    """
    from app import models

    row = (
        db.query(models.DataControlLog)
        .filter(
            models.DataControlLog.action_main == "Backup",
            models.DataControlLog.status == "Success",
        )
        .order_by(models.DataControlLog.timestamp.desc())
        .first()
    )
    return row.timestamp.isoformat() if row is not None and row.timestamp else None


def _iso(value):
    return value.isoformat() if value is not None else None


def _detail_name(detail, suffix: str):
    """
    The detail row's name column for a given suffix, whatever its prefix is.

    Derived from __table__.columns rather than from a hand-written map, because
    the nine prefixes are irregular and a map would be one more place to get
    `tv_name_en` wrong.
    """
    if detail is None:
        return None
    for column in detail.__table__.columns.keys():
        if column.endswith("_name_" + suffix):
            return getattr(detail, column, None)
    return None


def _tier_children(db, tab: str, row) -> int:
    """
    How many live rows point at this tier row.

    They are NOT deleted with it: collection_id, franchise_id and series_id are
    all ON DELETE SET NULL, so they survive orphaned-but-alive. The count is
    shown so that "this franchise still has 12 entries under it" is a reason to
    stop and look, rather than something discovered afterwards.
    """
    from app import models

    if tab == "Collection":
        return (
            db.query(models.Franchise)
            .filter(models.Franchise.collection_id == row.system_id)
            .count()
        )
    if tab == "Franchise":
        return (
            db.query(models.Media)
            .filter(models.Media.franchise_id == row.system_id)
            .count()
        )
    return (
        db.query(models.Media).filter(models.Media.series_id == row.system_id).count()
    )


def scan_orphans(db) -> dict:
    """
    Every local row the sheet no longer mentions, with what deleting it costs.

    Read-only, and all-or-nothing: raises CleanAborted rather than returning a
    partial answer, because from in here a half-read sheet and a genuinely
    emptied database look identical.
    """
    from app import models
    from app.utils.media_resolver import MEDIA_TABLES

    # Read EVERY tab before looking at a single local row, so that read_tab's
    # refusals fire before anything is reported rather than halfway through.
    indexes = {tab: index_tab(read_tab(tab)) for tab in CLEAN_TABS}

    tabs: dict[str, list[dict]] = {tab: [] for tab in CLEAN_TABS}
    anomalies: list[str] = []

    for media_row in db.query(models.Media).all():
        if not is_orphan_media(media_row, indexes["Media"]):
            continue
        ref = MEDIA_TABLES.get(media_row.media_type)
        detail = (
            db.query(ref.model)
            .filter(ref.model.system_id == media_row.system_id)
            .first()
            if ref
            else None
        )
        tabs["Media"].append(
            {
                "tab": "Media",
                "system_id": str(media_row.system_id),
                "public_id": media_row.public_id,
                "media_type": media_row.media_type,
                "label": ref.label if ref else media_row.media_type,
                "display_name": media_row.display_name,
                "name_en": _detail_name(detail, "en"),
                "name_cn": _detail_name(detail, "cn"),
                "created_at": _iso(media_row.created_at),
                "updated_at": _iso(media_row.updated_at),
                "blast_radius": blast_radius(db, media_row),
                "children": 0,
            }
        )

    # A detail row with no media parent should be impossible - the FK is
    # ON DELETE CASCADE - so it is an ANOMALY to report, never a candidate to
    # delete. Clean is not the right tool for a corruption it did not cause.
    for ref in MEDIA_TABLES.values():
        stranded = (
            db.query(ref.model)
            .outerjoin(models.Media, models.Media.system_id == ref.model.system_id)
            .filter(models.Media.system_id.is_(None))
            .count()
        )
        if stranded:
            anomalies.append(
                ref.label
                + ": "
                + str(stranded)
                + " detail row(s) have no media parent. The foreign key should "
                "make that impossible; Clean reports it rather than deleting it."
            )

    for tab, model_name, prefix in _TIER_TABS:
        model = getattr(models, model_name)
        for row in db.query(model).all():
            if not _is_orphan_tier(row, prefix, indexes[tab]):
                continue
            tabs[tab].append(
                {
                    "tab": tab,
                    "system_id": str(row.system_id),
                    "public_id": row.public_id,
                    "media_type": None,
                    "label": tab,
                    "display_name": getattr(row, prefix + "_name_en", None)
                    or getattr(row, prefix + "_name_cn", None),
                    "name_en": getattr(row, prefix + "_name_en", None),
                    "name_cn": getattr(row, prefix + "_name_cn", None),
                    "created_at": _iso(getattr(row, "created_at", None)),
                    "updated_at": _iso(getattr(row, "updated_at", None)),
                    # A tier row cascades nothing: its children are SET NULL and
                    # survive it. Counted in `children`, not in a blast radius.
                    "blast_radius": {"deleted": {}, "detached": {}},
                    "children": _tier_children(db, tab, row),
                }
            )

    return {
        "tabs": tabs,
        "totals": {
            "candidates": sum(len(rows) for rows in tabs.values()),
            "list_rows": sum(
                candidate["blast_radius"]["deleted"].get("list_rows", 0)
                for rows in tabs.values()
                for candidate in rows
            ),
        },
        "last_backup_at": _last_backup_at(db),
        "anomalies": anomalies,
    }
