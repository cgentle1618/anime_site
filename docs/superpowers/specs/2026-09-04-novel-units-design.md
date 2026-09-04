# Novel units — per-type structure and two-stage progress — design

Status: awaiting review
Date: 2026-09-04
Branch: modify

## Why

A novel entry today is one flat row. Every novel gets every progress field
regardless of what it actually has: `vol_total_original`, `vol_total_tw`,
`vol_fin`, `arc_total`, `arc_fin`, `ch_total`, `ch_fin`, and a manually chosen
`progress_display` to say which pair the UI should render. The four novel types
in `NOVEL_TYPES` — `Light Novel`, `Novel`, `Web`, `Other` — have genuinely
different structures, and the row models none of them.

Two concrete gaps:

- Per-volume titles exist as two parallel JSONB lists, `novel_name_each_cn` and
  `novel_name_each_en` (`app/models/novel.py:62`), each `[{key, name}]`. They
  are aligned by list position and nothing else — the CN list and the EN list
  can drift apart silently — and there is nowhere to put a per-volume remark.
- A web novel's arcs each have their own chapter count, and reading position is
  two-stage: "arc 2, chapter 101 of 112". The flat `arc_fin` / `ch_fin` pair
  cannot express that. `ch_fin` alone loses which arc you are in; `arc_fin`
  alone loses where you are inside it.

## Scope

In scope:

1. A `novel_unit` child table holding volumes, arcs, stories and chapters, with
   a name pair per language and a remark.
2. Two-stage progress for web novels that have arcs: one new `ch_fin_in_arc`
   column plus rollover arithmetic, with `arc_total`, `ch_total` and `ch_fin`
   derived from the unit rows.
3. Migration of the two JSONB name lists into unit rows, and dropping them.
4. Sheets round-trip for the new table.
5. Nested writes through the existing media-router factory.
6. Editor, tracker and detail-page changes; `JP/KR` relabelling.

Out of scope, deliberately:

- Nested units. "Other" picks one flat kind; it does not hold volumes that
  contain stories that contain chapters. No `parent_unit_id`, no tree editor.
  (Confirmed with the user: there are "no two stages" for Light Novel, Novel
  and Other.)
- Per-volume TW records. TW is a scalar count of how far translation has got.
- Individual chapter rows. An arc stores a chapter *count*, not chapters.
- Renaming the `vol_total_original` column. Relabelled in the UI only; see
  Decision F.
- Fill/Pull enrichment of units. No external API supplies them.

## Decisions taken

### Decision A — one `novel_unit` table with a kind discriminator

Rejected: separate `novel_volume` / `novel_arc` tables. Cleaner columns per
kind, but "Other" spans volume, story and chapter, so it would need to reach
into three tables, and every layer — forms, detail page, Sheets, progress
display — grows per-type branching. Three tables, three tabs, three editors.

Rejected: structured JSONB on the novel row (one `volumes` list, one `arcs`
list). It keeps the single-row Sheets round-trip and needs no join, and it is
the established local pattern. But Postgres enforces nothing inside it, every
edit rewrites the whole array so two concurrent edits to different volumes lose
one silently, and adding a field later means a hand-written document rewrite
rather than an Alembic column.

Chosen: one table. Ordering, identity and per-unit attributes are what rows are
for, and `Watch Order List -> Section -> Item` already proves the Sheets
pipeline handles an FK chain. The cost is that `ch_count` is null for every
non-arc row and the name columns are usually unused on arcs — the ordinary
single-table-inheritance tradeoff, cheap at this column count.

Performance was considered and is not a deciding factor: at a few thousand
volume rows both shapes serve a list page in single-digit milliseconds. The one
real risk is an N+1 on the library page, addressed by `selectinload`.

### Decision B — unit rows are optional for volumes, authoritative for arcs

This asymmetry is deliberate and is the subtlest part of the design.

**Volumes.** Listing volumes is enrichment. The user may record names for a few
volumes, or none. So the denominator stays `vol_total_original` /
`vol_total_tw`, exactly as today, and `vol_fin` remains a plain count that may
legitimately exceed the number of volume rows. Nothing about volume progress
derives from the rows.

**Arcs.** An arc row carries `ch_count`, which is the only place that number
lives. So when arc rows exist they are authoritative: `arc_total` and
`ch_total` derive from them. When a web novel has no arc rows — arcs are
optional — it falls back to the flat `ch_fin` / `ch_total` pair it uses now.

### Decision C — the cursor lives on the novel, not on the units

Rejected: a `finished` boolean or per-unit `ch_fin` on each arc row. More
granular, and it would express non-linear reading, which does not happen here.

Chosen: `arc_fin` counts *fully finished* arcs, so the arc currently being read
is at position `arc_fin + 1`, and `ch_fin_in_arc` is how far into that arc the
reader has got. The user's example — arc 1 done, 101 of arc 2's 112 chapters —
is `arc_fin = 1`, `ch_fin_in_arc = 101`.

Rollover is normalised server-side on write: while `ch_fin_in_arc` is greater
than or equal to the current arc's `ch_count`, subtract that `ch_count` and
increment `arc_fin`. Stepping down below zero borrows from the previous arc.
Normalising on the server rather than in the stepper means the Sheets restore
path and a hand-edited sheet get the same guarantee as the UI.

### Decision D — derived columns stay stored

`arc_total`, `ch_total` and absolute `ch_fin` are recomputed from the unit rows
on every write, but remain real columns rather than becoming computed
properties. `_TOTAL_FIELDS` (`ch_total` for novel), `mark_novel_completed`,
`NovelDashboardCard`, `MediaCard` and the Plan page all read them today, and
none of that has to change. This follows the existing `run_sync_*` derivation
idiom rather than inventing a second one.

Absolute `ch_fin` = sum of `ch_count` for arcs at position <= `arc_fin`, plus
`ch_fin_in_arc`. For the example above, with arc 1 at 100 chapters and arc 2 at
112: `100 + 101 = 201`. Once arc 2 closes: `100 + 112 = 212`.

Carry stops at the last recorded arc. If `arc_fin` equals the arc count,
`ch_fin_in_arc` is left as it stands rather than clamped to zero — an ongoing
web novel is read into an arc that has not been recorded yet, and clamping
would silently discard that progress.

### Decision E — the name pair is key + title, per language

Each unit carries `unit_key` ("vol 1", "第一卷") and a title, both optional, in
both CN and EN: `unit_key`, `name_cn`, `name_en`.

Rejected: one `name` per unit with no language split. Simpler, but it discards
data — the two existing JSONB lists are per-language and would have to collapse.

The chosen shape fixes the drift bug by construction: one row holds both
languages, so they cannot fall out of alignment the way two positional lists
can.

Fallback is a display-time rule, nothing stored. If `unit_key` is empty and a
title exists, render a generated key from kind and position — "Vol 1", "Arc 2",
"Story 3". If both are empty, the generated key stands alone.

### Decision F — `vol_total_original` is relabelled, not renamed

The user asked for "JP/KR" rather than "JP", since novels come from either.
`NOVEL_REGIONS` already spans `JP`, `CN`, `TW`, `KR`, `Western`.

The column keeps the name `vol_total_original`. Renaming it would change the
Sheets header, and header names are the restore contract —
`credit_roles.LEGACY_SHEET_COLUMN` exists precisely because headers must not
move. The label changes in `fieldMeta.js` to "Total Volumes (JP/KR)" and in the
progress-display choice to "VOL JP/KR".

### Decision G — `progress_display` follows the type

Today it is a free manual choice of five values. With the type driving
structure, almost all of it is determined:

| Type | Renders |
|---|---|
| `Web` with arc rows | `arc_ch` — two-stage |
| `Web` without arc rows | `ch` |
| `Light Novel`, `Novel` | volumes |
| `Other`, kind `volume` | volumes |
| `Other`, kind `story` or `chapter` | `ch` |

`Other` is single-stage whichever kind it uses (the user: for Light Novel,
Novel and Other "we'll just record finished volume x out of y"); only the
counter pair changes with the kind — `vol_fin` / `vol_total_original` for
volumes, `ch_fin` / `ch_total` for stories and chapters.

The only genuine choice left is JP/KR versus TW volumes, so the field narrows
to that.

Kept as a stored column rather than derived, so an entry that wants to override
still can, and so the migration is a no-op for existing rows.

## Schema

### New table `novel_unit`

| Column | Type | Null | Default | Description |
|---|---|:-:|---|---|
| `system_id` | UUID | no | `uuid4` | PK |
| `novel_id` | UUID | no | | FK -> `novel.system_id`, `ON DELETE CASCADE`, indexed |
| `unit_kind` | String | no | | `volume` \| `arc` \| `story` \| `chapter` |
| `position` | Float | no | | Order within the novel; Float to match `read_order` and the half-volume convention |
| `unit_key` | String | yes | | Optional label, e.g. "vol 1", "第一卷" |
| `name_cn` | String | yes | | Optional title |
| `name_en` | String | yes | | Optional title |
| `remark` | String | yes | | Per-unit remark |
| `ch_count` | Float | yes | | Arcs only; null for other kinds |
| `created_at` / `updated_at` | DateTime | | `get_taipei_now` | Matches every other table |

Constraints:

- `CheckConstraint("unit_kind IN ('volume','arc','story','chapter')", name="ck_novel_unit_kind")`
- `CheckConstraint("unit_kind = 'arc' OR ch_count IS NULL", name="ck_novel_unit_ch_count_arc_only")`
- Index on `(novel_id, unit_kind, position)`.

`position` is deliberately **not** unique. Reordering in the editor swaps
adjacent values, and a unique constraint would fire mid-swap.

### Changes to `novel`

- New: `ch_fin_in_arc` Float, NOT NULL, default `0`.
- Dropped: `novel_name_each_cn`, `novel_name_each_en`.
- New relationship: `units = relationship("NovelUnit", cascade="all, delete-orphan", order_by="NovelUnit.position")`.

### Kind vocabulary per type

A plain map, not a table — it is code branching, which `docs/options.md` says
keeps a value out of `system_option`:

| `novel.type` | Kinds offered |
|---|---|
| `Light Novel` | `volume` |
| `Novel` | `volume` |
| `Web` | `arc` |
| `Other` | `volume`, `story`, `chapter` |

Lives next to `NOVEL_TYPES` in `app/utils/constants.py`, mirrored in
`frontend/src/config/fieldOptions.js`, guarded against drift by a test the way
`planNext.test.js` guards `ALLOWED_SCOPES`.

## Migration

One Alembic revision, in order:

1. Create `novel_unit`.
2. Add `novel.ch_fin_in_arc`.
3. Data migration: for each novel, align `novel_name_each_cn` and
   `novel_name_each_en` by position into rows with `unit_kind = 'volume'` and
   `position = i + 1`. `unit_key` takes the CN entry's `key`, falling back to
   the EN entry's. `name_cn` and `name_en` take the respective `name` values.
   Where the two lists differ in length the longer one governs and the missing
   language is null. Rows where key and both names are all empty are skipped.
4. Drop `novel_name_each_cn` and `novel_name_each_en`.

Step 4 is the one irreversible step, so the revision runs after a Backup. The
downgrade recreates the two columns and writes the lists back from the rows;
per-unit remarks and `ch_count` are lost on downgrade, which is stated in the
revision docstring rather than left silently true.

## API

`MediaTypeSpec` gains:

```python
# Payload key -> nested-collection writer, popped before the model is
# constructed. Only novel uses this today.
nested_collections: Optional[dict[str, Callable]] = None
```

`make_media_router` pops those keys alongside `pop_remark` and `pop_plan_flag`
— the factory already has this escape hatch for payload keys that are not
columns, because `spec.model(**payload)` in `create` and the blind `setattr`
loop in `update` would otherwise fail on a nested list.

The writer diffs the incoming list against existing rows in one transaction:
match on `system_id` and update, insert rows without one, delete rows the
payload omits. So the frontend keeps saving a whole novel in a single
`PUT /api/novel/{id}` carrying `units: [...]`, which is what `Add.jsx` and
`Modify.jsx` already do for every other field.

`NovelResponse` gains `units: list[NovelUnitResponse]`. The list endpoint adds
`selectinload(Novel.units)` so `/library/novel` issues one extra query rather
than one per novel.

`PATCH` keeps its column-only whitelist (`app/routers/_patching.py`): the
tracker's progress steps patch `arc_fin` and `ch_fin_in_arc`, both plain
columns, so nothing there changes.

Deleting a novel already cascades through `MEDIA_TABLES` for credits, tags and
relations; units ride the FK's `ON DELETE CASCADE`.

## Sheets

One line in `SHEET_TABS`, placed immediately after `SheetTab("Novel", ...)` so
restore order satisfies the FK, exactly as `Watch Order Section` follows its
list:

```python
SheetTab("Novel Unit", models.NovelUnit, f.parse_novel_unit_from_sheet),
```

Plus `parse_novel_unit_from_sheet` in `app/utils/formatter.py`, modelled on
`parse_watch_order_section_from_sheet`. Backup needs no change: it derives
headers from `tab.model.__table__.columns` and writes every row.

## Frontend

- `BelongingNovelsEditor.jsx` becomes `NovelUnitsEditor.jsx`: one row per unit
  with key / CN / EN / remark, `ch_count` shown only when the kind is `arc`,
  keeping the existing up-down reordering. The kinds it offers come from the
  per-type map.
- `NovelTrackerBlock.jsx` gains the two-stage stepper for web-with-arcs. A
  chapter step past the current arc's `ch_count` rolls into the next arc;
  stepping below zero borrows from the previous one. The volume rows relabel to
  JP/KR.
- `getNovelProgress` in `lib/formatters.js` renders `arc 2 · 101/112 CH` for
  the two-stage case and is otherwise unchanged.
- `NovelDashboardCard.jsx` and `MediaCard.jsx` read the derived `ch_fin` /
  `ch_total`, so they need only the new label.
- `formFactories.js` and `fieldMeta.js` replace the two `novel_name_each_*`
  entries with `units`.
- `pages/detail/Novel.jsx` renders the unit list with the display-time key
  fallback.

## Testing

Failing test first for each behaviour change, per CLAUDE.md.

Unit:

- Rollover arithmetic: `ch_fin_in_arc` crossing `ch_count` upward and downward,
  across more than one arc boundary, and clamped at both ends.
- Derived `ch_fin` / `ch_total` / `arc_total` from arc rows, including the
  user's example resolving to 201 and then 212.
- The key fallback: empty key with a title renders "Vol 1"; both empty renders
  the generated key alone.
- Volume progress is unaffected by volume rows (Decision B) — `vol_fin` may
  exceed the row count without the derivation touching it.

API:

- Units round-trip through `PUT /api/novel/{id}`: insert, update, delete-by-
  omission, all in one request.
- The list endpoint does not N+1 (assert query count).
- `mark_novel_completed` sets `arc_fin` to the arc count and zeroes
  `ch_fin_in_arc`.

Migration:

- Mismatched-length CN and EN lists migrate without loss.
- A novel with neither list produces no rows.

Sheets:

- The new tab restores after its parent, alongside `test_data_control_pull_tab.py`.

Frontend: `vitest` for the stepper rollover and the fallback rendering; the
per-type kind map guarded against backend drift.

## Docs to update

Same change, `Last verified` bumped: `docs/data-model.md` (the `novel` section
and the table list), `docs/options.md` (`NOVEL_TYPES` kinds, the narrowed
`progress_display`), `docs/entry-types.md` (novel structure), `docs/api.md`
(the `units` payload), `docs/business-rules.md` (rollover and derivation),
`docs/frontend/components.md` (`NovelUnitsEditor`), `docs/testing.md`.
