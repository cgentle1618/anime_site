"""backfill note rows from the notes JSONB columns

Revision ID: note_backfill_rows
Revises: wo_item_importance
Create Date: 2026-08-23 00:00:00.000000

The `notes` columns are NOT dropped here. This revision only moves content, so
it can be run and inspected while the old columns are still readable; a later
revision drops them once the frontend no longer reads them.

Two things are knowingly lossy, and both are reported rather than hidden:

1. `episode_comments` was stored as a JSONB object map, which preserves no
   insertion order. The original order is not recoverable, so rows are ordered
   by a natural sort of the episode string instead of pretending otherwise.
2. `special_changes` / `special_episodes` split into `op_ed_changes` and
   `extended_episodes`. The kinds 回顧 and 其他 belong to neither and are
   retired from the vocabulary; any row carrying one is logged with its owner
   id and content and left for manual placement, never silently dropped.

`name_link` held one link and `note.links` holds a list, so that direction
widens and loses nothing.
"""
from dataclasses import dataclass, field
import json
import logging
import re
import uuid
from typing import Any, Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'note_backfill_rows'
down_revision: Union[str, Sequence[str], None] = 'wo_item_importance'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

logger = logging.getLogger("alembic.runtime.migration")

# owner_type -> table name. The seven media tables are the only ones that ever
# had a notes column; the three tiers start empty.
MEDIA_TABLES = {
    "anime": "anime",
    "anime-movie": "anime_movies",
    "movie": "movies",
    "tv-show": "tv_shows",
    "cartoon": "cartoons",
    "manga": "manga",
    "novel": "novel",
}

# Sections that already left the blob for their own tables.
ALREADY_MIGRATED = {"quotes", "memes", "quotes_memes"}

RETIRED_SPECIAL_SECTIONS = {"special_changes", "special_episodes"}

# 特別 was the TV spelling, 特殊 the anime one; the vocabulary keeps 特殊.
OP_ED_KIND_MAP = {
    "變化OP": "變化OP",
    "變化ED": "變化ED",
    "無OP": "無OP",
    "無ED": "無ED",
    "特殊OP": "特殊OP",
    "特殊ED": "特殊ED",
    "特別OP": "特殊OP",
    "特別ED": "特殊ED",
}
EXTENDED_KIND = "加長"

_DIGITS = re.compile(r"\d+")


def _blank_row(section: str) -> dict:
    return {
        "section": section,
        "episode": None,
        "kind": None,
        "title": None,
        "content": None,
        "links": None,
        "sort_index": 0.0,
    }


def _clean(value: Any) -> Any:
    """Trim strings; turn empties into None."""
    if isinstance(value, str):
        value = value.strip()
        return value or None
    return value


def _clean_links(value: Any) -> Any:
    if not isinstance(value, list):
        return None
    kept = [v.strip() for v in value if isinstance(v, str) and v.strip()]
    return kept or None


def _episode_sort_key(episode: Any):
    """
    Natural sort: 'ep 2' before 'ep 10'.

    Episodes with no digits sort after every numbered one, so 'OVA' lands at
    the end rather than in the middle.
    """
    text = episode if isinstance(episode, str) else ""
    match = _DIGITS.search(text)
    if match:
        return (0, int(match.group()), text)
    return (1, 0, text)


def _row_from_item(section: str, item: Any) -> dict | None:
    """
    One JSONB item to one note row, detecting the shape structurally.

    The old configs named seven section types, but the stored shapes differ in
    ways the configs did not state - `episode_entry` used a plural `episodes`
    key, `episode_type_desc` a singular `episode`, `name_link` a single `link`.
    Reading the value's structure avoids re-encoding that table here.
    """
    row = _blank_row(section)

    if isinstance(item, str):
        row["content"] = _clean(item)
        return row if row["content"] else None

    if not isinstance(item, dict):
        return None

    # episode_entry (episodes) or episode_type_desc (episode)
    row["episode"] = _clean(item.get("episodes") or item.get("episode"))
    row["kind"] = _clean(item.get("type"))
    # desc_links / episode shapes use `description`; name_link uses `name`.
    row["content"] = _clean(item.get("description") or item.get("comment"))
    row["title"] = _clean(item.get("name"))

    links = item.get("links")
    if links is None and item.get("link"):
        # name_link held exactly one link; the column holds a list.
        links = [item["link"]]
    row["links"] = _clean_links(links)

    if not any((row["episode"], row["content"], row["title"], row["links"])):
        return None
    return row


def _rows_from_value(section: str, value: Any) -> list[dict]:
    """Every note row for one section's stored value."""
    if value is None:
        return []

    # episode_comments is an object map {episode: comment}, not a list.
    if isinstance(value, dict):
        pairs = [
            (ep, comment)
            for ep, comment in value.items()
            if _clean(ep) or _clean(comment)
        ]
        pairs.sort(key=lambda pair: _episode_sort_key(pair[0]))
        rows = []
        for index, (episode, comment) in enumerate(pairs):
            row = _blank_row(section)
            row["episode"] = _clean(episode)
            row["content"] = _clean(comment)
            row["sort_index"] = float(index)
            rows.append(row)
        return rows

    items = value if isinstance(value, list) else [value]
    rows = []
    for item in items:
        row = _row_from_item(section, item)
        if row is None:
            continue
        row["sort_index"] = float(len(rows))
        rows.append(row)
    return rows


@dataclass
class SplitResult:
    rows: list[dict] = field(default_factory=list)
    unplaced: list[Any] = field(default_factory=list)


def _split_special(value: Any) -> SplitResult:
    """
    Split the retired special_changes / special_episodes into two sections.

    加長 becomes its own section, so its kind is cleared - the section is the
    kind. The OP/ED kinds keep theirs, normalized to the 特殊 spelling. Anything
    else (回顧, 其他, or a stray value) is returned unplaced.
    """
    result = SplitResult()
    items = value if isinstance(value, list) else ([value] if value else [])

    for item in items:
        kind = _clean(item.get("type")) if isinstance(item, dict) else None

        if kind == EXTENDED_KIND:
            row = _row_from_item("extended_episodes", item)
            if row:
                row["kind"] = None
                row["sort_index"] = float(
                    sum(1 for r in result.rows if r["section"] == "extended_episodes")
                )
                result.rows.append(row)
            continue

        if kind in OP_ED_KIND_MAP:
            row = _row_from_item("op_ed_changes", item)
            if row:
                row["kind"] = OP_ED_KIND_MAP[kind]
                row["sort_index"] = float(
                    sum(1 for r in result.rows if r["section"] == "op_ed_changes")
                )
                result.rows.append(row)
            continue

        result.unplaced.append(item)

    return result


def upgrade() -> None:
    """Expand every notes JSONB blob into note rows."""
    conn = op.get_bind()
    total = 0
    unplaced_report: list[str] = []

    for owner_type, table in MEDIA_TABLES.items():
        rows = conn.execute(
            sa.text(
                f"SELECT system_id, notes FROM {table} WHERE notes IS NOT NULL"
            )
        ).fetchall()

        for owner_id, notes in rows:
            blob = notes if isinstance(notes, dict) else json.loads(notes or "{}")
            note_rows: list[dict] = []

            for section, value in blob.items():
                if section in ALREADY_MIGRATED:
                    # Quotes and memes left the blob in earlier revisions.
                    continue
                if section in RETIRED_SPECIAL_SECTIONS:
                    split = _split_special(value)
                    note_rows.extend(split.rows)
                    for item in split.unplaced:
                        unplaced_report.append(
                            f"{owner_type} {owner_id} {section}: {item!r}"
                        )
                    continue
                note_rows.extend(_rows_from_value(section, value))

            for row in note_rows:
                conn.execute(
                    sa.text(
                        "INSERT INTO note (system_id, owner_type, owner_id, section,"
                        " episode, kind, title, content, links, sort_index,"
                        " created_at, updated_at)"
                        " VALUES (:system_id, :owner_type, :owner_id, :section,"
                        " :episode, :kind, :title, :content, CAST(:links AS JSONB),"
                        " :sort_index, NOW(), NOW())"
                    ),
                    {
                        "system_id": str(uuid.uuid4()),
                        "owner_type": owner_type,
                        "owner_id": str(owner_id),
                        **row,
                        "links": json.dumps(row["links"]) if row["links"] else None,
                    },
                )
            total += len(note_rows)

    logger.info("Backfilled %s note rows.", total)
    if unplaced_report:
        logger.warning(
            "%s special-change item(s) had no home section and were NOT migrated. "
            "Place them by hand:\n%s",
            len(unplaced_report),
            "\n".join(unplaced_report),
        )


def downgrade() -> None:
    """Delete the backfilled rows.

    The `notes` columns were never dropped by this revision, so the original
    content is still there and nothing needs folding back.
    """
    op.execute("DELETE FROM note")
