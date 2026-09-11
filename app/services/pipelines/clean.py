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
