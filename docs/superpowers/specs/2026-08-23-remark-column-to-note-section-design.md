# Remark Column → Remark Note Section — Design

**Date:** 2026-08-23
**Status:** Approved, ready for implementation planning

## Problem

`remark` exists twice. Every one of the ten note owners — the seven media
tables plus `series`, `franchise` and `collection` — carries a `remark` Text
column, and the notes registry separately declares a `remark` section stored as
a singleton row in `note`. The notes-restructure design
(`2026-08-23-notes-restructure-design.md`) called the column "a separate field"
and left it alone. That was the wrong call: the two hold the same kind of text,
so a remark written on the notes page and a remark written in the Modify form
land in different places and neither view shows both.

This design collapses them into one: the `note` row is the only storage, and the
column is dropped.

## Goals

- One storage location for a remark: `note` where `section = 'remark'`.
- Existing text in both places survives the merge, with the column's text
  labelled so it can be cleaned up by hand afterwards.
- The surfaces that read and write a remark today keep working: the Add form,
  the Modify form, the hub hero's `RemarkModal`, the ten detail pages,
  `Delete.jsx`'s previews and the `/check/remarks` review queue.

## Non-goals

- The `remark` columns on `quote`, `meme`, `watch_order_list` and
  `media_relation` are those entities' own fields and are untouched.
- No change to the notes page itself. The `remark` section stays a singleton.

## Design

### 1. Storage and the read path

The `remark` column is dropped from all ten tables. Each model gains a
read-only `column_property` resolving the singleton note row:

```python
Anime.remark = column_property(
    select(Note.content)
    .where(Note.owner_type == "anime",
           Note.owner_id == Anime.system_id,
           Note.section == "remark")
    .scalar_subquery()
)
```

These are attached in `app/models/__init__.py` after every model is imported,
so the ten declarations sit together and none of the model modules needs to
import `Note`.

This is the load-bearing choice. `remark` stays an ordinary attribute on the
ORM objects, so `AnimeResponse.remark` keeps resolving through
`from_attributes` and every read surface keeps working with no change:

| Reader | Why it keeps working |
| --- | --- |
| Ten detail pages, hub heroes | Response schemas still carry `remark` |
| `Delete.jsx` previews | Same |
| `find_all_remarks` | `.filter(model.remark.isnot(None), model.remark != "")` compiles to a subquery in `WHERE` |
| Google Sheets backup | `format_model_for_sheet` walks `__table__.columns`; a `column_property` is not one, so remark leaves the ten sheets on its own and lives only in the `Note` tab |

Cost: one correlated subquery per row on list endpoints (up to the factory's
2000-row cap), served by the existing `ix_note_owner_section` index.

### 2. The write path

A `column_property` is read-only — assigning to it raises. Every write path
must therefore route `remark` to the note row instead of the model.

New `app/services/domain/remark_field.py`:

- `pop_remark(data: dict) -> tuple[dict, str | None, bool]` — removes `remark`
  from a payload dict, returning the dict, its value, and whether the key was
  present at all (so a PATCH that omits `remark` does not clear it).
- `upsert_remark(db, owner_type, owner_id, text) -> None` — creates, updates or
  deletes the singleton row. Empty or whitespace-only text deletes it, matching
  the notes page's own behaviour for a cleared singleton.

Eighteen handlers call it — create, put and patch on each of six routers:
`_factory.py` (covering movie, tv_show, cartoon, manga, novel) plus the
hand-written `anime`, `anime_movie`, `franchise`, `series` and `collection`.

`remark` stays on the Pydantic `*Base` schemas, so Add, Modify and the
`RemarkModal` post exactly what they post today. Two writers now edit one row —
a form and the notes page — and the rule is last write wins. That is acceptable
for a single-admin app.

### 3. Migration — one Alembic revision

**Upgrade**, per table, for rows whose `remark` is non-empty:

- If a `remark` note row already exists for that owner, its content becomes
  `<existing note content>` + blank line + `original remark:` + newline +
  `<column text>`.
- Otherwise a new note row is inserted (`section = 'remark'`, `sort_index = 0`,
  timestamps from `now()`). No `original remark:` label in this case — there is
  nothing to distinguish it from.

Then `ALTER TABLE <t> DROP COLUMN remark` ×10.

**Downgrade** re-adds the ten columns, copies `note.content` back for
`section = 'remark'` rows, and deletes those rows. It is deliberately
asymmetric: a merged remark goes back as one blob including the
`original remark:` label. The revision docstring says so.

Written as raw SQL, no ORM imports, per the existing revisions in
`alembic/versions/`.

### 4. Google Sheets

The ten `"remark": parse_from_sheet(raw.get("remark"), str)` lines come out of
the media and tier parsers in `app/utils/formatter.py`. This is required, not
cosmetic: `pull.py:619` does `Model(**clean_header_dict)` and `pull.py:615`
does `setattr(existing, key, value)`, either of which raises once `remark` is a
read-only `column_property`.

Restore keys off header names, so a stale `remark` column in a pre-migration
spreadsheet is simply ignored. The migrated rows round-trip through the
existing `Note` tab, which backup and pull already handle.

Consequence worth stating: restoring a pre-migration backup will not bring
remark text back into the note table. The single-revision migration is the
authority for the data move.

### 5. Frontend

Essentially unchanged. `fieldMeta`, `formFactories`, `payloads.js`, the twenty
add/modify tabs, the ten detail pages, `RemarkModal`, `ReviewQueue` and
`Delete.jsx` all keep their current shape — that is the point of the
write-through. Verification is a rebuild plus a click through one hub, one
detail page, the Modify form and the review queue.

## Testing

Test-driven, in this order:

1. **Unit** — `remark_field`: upsert creates, updates, and deletes on empty;
   `pop_remark` distinguishes absent from `None`.
2. **Unit** — the merge string: both-populated, column-only, note-only, and
   whitespace-only column text.
3. **API** — `PATCH /api/anime/{id}` with `remark` creates the note row and the
   response echoes it; a notes-page edit shows up in the entry response; an
   empty string clears it; `PATCH` without the key leaves it alone.
4. **API** — `/api/data-control/check/remarks` still returns entries whose
   remark now lives in `note`.
5. **API** — creating an entry with a remark, and a franchise/series/collection
   with a remark, produces exactly one note row each.
6. **Migration** — run `alembic upgrade head` against the local Postgres with a
   seeded owner that has both a column remark and a note remark; assert the
   merged content, then `downgrade -1` and assert the column comes back.

## Risks

- **List-endpoint cost.** Ten correlated subqueries added to the hottest read
  paths. Indexed, but worth watching on the library page.
- **Two writers, one row.** A stale Modify form can overwrite a newer
  notes-page remark. Accepted.
- **The drop is irreversible in practice.** Downgrade restores the text but a
  pre-migration Sheets backup does not. Verify on the local DB first.
