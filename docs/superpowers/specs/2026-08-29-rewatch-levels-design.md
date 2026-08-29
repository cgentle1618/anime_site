# To Rewatch / To Reread — Per-Type Scopes

**Date:** 2026-08-29
**Status:** Design — awaiting review
**Depends on:** `docs/superpowers/specs/2026-08-29-plan-next-design.md` and its
plan, through **Task 10 (Plan page rewrite)**. See § Sequencing.

> **Revision note.** An earlier draft of this spec stored the flag as a
> `to_rewatch_types` JSONB column on `franchise` and `series`, arguing against a
> dedicated table. That reasoning assumed no such table existed. It does now —
> `plan_next` landed in commits `871b5ec`…`59dd55c` while this spec was being
> written, replacing the eight `watch_next` / `read_next` / `watch_next_group`
> columns. The premise is gone, so the storage decision is reversed. The target
> scope mapping below is unchanged from that draft.

## Problem

The Plan page's To Rewatch section reads the flag from one tier per media type,
and the mapping is accidental rather than chosen:

- **Anime** reads `franchise.to_rewatch` — forced, because the `anime` table has
  no `to_rewatch` column.
- **Every other type** reads the media entry's own boolean.
- **Series is read nowhere**, despite `series.to_rewatch` existing with full
  admin UI behind it (`SeriesAddTab`, `SeriesModifyTab`, a badge on `SeriesPage`).
- **Comic has no tab at all**; `comic.to_reread` is a column with no UI.

Each media type should declare which tiers — franchise, series, entry — may
carry the flag.

The columns cannot express this. `series` is one table shared by every media
type, so a series-level flag would need one boolean column per type; a franchise
holding both anime and movies has one boolean and no way to say which it means;
and an anime entry cannot be marked at all. These are the same three limitations
`plan_next`'s docstring records for `watch_next`.

## Target scopes by media type

| Type        | Franchise | Series | Entry | Change from today               |
| ----------- | :-------: | :----: | :---: | ------------------------------- |
| Anime       |     ✔     |        |       | none                            |
| Anime Movie |           |        |   ✔   | none                            |
| Movie       |     ✔     |   ✔    |   ✔   | + series, + franchise           |
| TV Show     |     ✔     |   ✔    |   ✔   | + series, + franchise           |
| Cartoon     |     ✔     |        |       | swap: drop entry, add franchise |
| Manga       |           |        |   ✔   | none                            |
| Novel       |     ✔     |   ✔    |   ✔   | + series, + franchise           |
| Comic       |           |   ✔    |   ✔   | + entry, + series (new tab)     |

This deliberately differs from Watch Next's mapping — anime and cartoon are
rewatched as whole franchises, novels are reread at every tier — which is why
`ALLOWED_SCOPES` gains a kind dimension below.

## Decision: extend `plan_next` with a `kind` column

To Rewatch is Watch Next with a different verb. Both are Plan-page queues, both
target one of three tiers, both need a per-media-type map of legal tiers, both
need FK-less targeting because no foreign key spans eight entry tables plus
`series` and `franchise`, both need delete-cleanup, and both need a Sheets path.
`plan_next` already carries all of it.

Add one column:

```
plan_next.kind = "next" | "rewatch"
```

`UniqueConstraint("kind", "scope", "target_id", "media_type")` replaces the
current three-column constraint; `Index("ix_plan_next_kind_type_scope", "kind",
"media_type", "scope")` replaces the current two-column index. The row's
existence remains the flag — un-marking deletes the row.

Everything else follows for free: target resolution through `OWNER_TABLES`, the
`missing=True` treatment of dangling references, the delete-cleanup obligation
on the franchise and series delete paths, the "Plan Next" Sheets tab, and the
router.

The anime special case disappears. "Anime is rewatched at franchise scope"
stops being a schema accident and becomes one line in `ALLOWED_SCOPES`, alterable
later without a migration.

### Rejected alternatives

**A second table with the same shape.** Buys decoupling we do not want. The two
lists render side by side on one page and are read by one hook; separate tables
would drift — one gains `remark`, the other does not; one gets delete-cleanup,
the other rots.

**JSONB columns on `franchise` and `series`** (the earlier draft). Its whole
argument was that a table would cost a new Sheets tab plus pipeline paths. That
cost is now paid. Keeping it would put the two halves of one page on two
contradictory architectures.

**Renaming `plan_next`.** The table now holds more than "next", so the name is a
wart. Renaming is cheapest now, four commits in — but it collides head-on with
another session's eight remaining tasks, which is precisely the coordination cost
this design exists to avoid. Keep the name; document in `database-schema.md` that
`plan_next` holds both kinds.

## Data model

### `plan_next.kind`

`String`, not nullable, no server default. Validated in the API layer against
`KINDS`, matching the choice already made for `media_type`, `scope`,
`media_relation.relation_type` and `watch_order_item.importance` — extending the
vocabulary needs no migration.

### `app/utils/plan_next_kinds.py`

Gains the kind vocabulary and re-keys the scope map:

```python
KINDS: tuple[str, ...] = ("next", "rewatch")

ALLOWED_SCOPES: dict[str, dict[str, frozenset[str]]] = {
    "next": { ... },      # unchanged, exactly today's dict
    "rewatch": {
        "anime":       frozenset({"franchise"}),
        "anime-movie": frozenset({"entry"}),
        "movie":       frozenset({"entry", "series", "franchise"}),
        "tv-show":     frozenset({"entry", "series", "franchise"}),
        "cartoon":     frozenset({"franchise"}),
        "manga":       frozenset({"entry"}),
        "novel":       frozenset({"entry", "series", "franchise"}),
        "comic":       frozenset({"entry", "series"}),
    },
}
```

`scope_allowed(media_type, scope)` becomes `scope_allowed(kind, media_type,
scope)`. **This is a breaking signature change to a module that is four commits
old**; every call site must move in the same change. The module's closing
assertion becomes `set(ALLOWED_SCOPES) == set(KINDS)` plus a per-kind check that
each inner dict covers `MEDIA_TYPE_KEYS`.

`SIZE_THRESHOLDS`, `SIZE_MEASURE` and `SIZE_GROUPS` are untouched — size buckets
are a property of a group, independent of why it is queued.

### Every existing column is dropped

All nine become rows: `to_rewatch` on `franchise`, `series`, `anime_movies`,
`movies`, `tv_shows` and `cartoons`; `to_reread` on `manga`, `novel` and
`comic`. The entry-level ones survive as API-level virtual fields (below), so
the drop is invisible to the frontend. `cartoons` is the exception — cartoon
moves to franchise-only, so its flag disappears from the API too.

## API

No new endpoints. The existing `plan_next` router gains `kind`:

| Method   | Path                       | Change                                                        |
| -------- | -------------------------- | ------------------------------------------------------------- |
| `GET`    | `/api/plan-next/`          | optional `?kind=` filter alongside `media_type` and `scope`    |
| `POST`   | `/api/plan-next/`          | `kind` required in the body; validated against `KINDS` and the per-kind scope map |
| `DELETE` | `/api/plan-next/{id}`      | unchanged                                                     |
| `DELETE` | `/api/plan-next/target`    | `kind` joins the target triple, making it a quadruple          |

`GET` without `kind` returns both kinds, so the Plan page still loads its whole
dataset in one call.

**Requests omitting `kind` default to `"next"`**, so every call site written by
the plan-next work keeps passing without edit.

### Entry flags stay as virtual fields

`to_rewatch` and `to_reread` survive on the entry create/update/read schemas as
virtual fields backed by the table, exactly as the plan-next spec does for
`watch_next` / `read_next`:

- on write, `true` upserts a `kind='rewatch'`, `scope='entry'` row; `false`
  deletes it;
- on read, the flag is computed from `plan_next`.

This is what keeps the change small. `formFactories.js`, `fieldMeta.js`,
`payloads.js`, every Add and Modify tab, every entry detail page and the library
toggles keep working untouched.

Two exceptions:

- **Cartoon** loses the field entirely — schema, model column, the `to_rewatch`
  entry in `app/registry.py:115` `list_filters` (cartoon is the only entry type
  that exposed it as a query param), and its frontend surfaces.
- **Anime** does not gain one, since anime rewatches at franchise scope only.

## Pipelines

### Sheets

**No new tab.** `kind` rides along on the "Plan Next" tab created by plan-next
Task 7. Backup needs no code change — headers derive from `__table__.columns`
(`backup.py:141-149`). `parse_plan_next_from_sheet` gains
`"kind": parse_from_sheet(raw.get("kind"), str)`.

Nine tabs lose a column. The corresponding parsers in `app/utils/formatter.py`
drop the key: `parse_franchise_from_sheet`, `parse_series_from_sheet`,
`parse_anime_movie_from_sheet`, `parse_movie_from_sheet`,
`parse_tv_show_from_sheet` and `parse_cartoon_from_sheet` lose `to_rewatch`;
the manga, novel and comic parsers lose `to_reread`. This mirrors what
plan-next Task 7 does for `watch_next` / `read_next`, and should reuse whatever
shape that task settles on.

> **Regression risk.** `business-logic.md:1548` records that
> `parse_franchise_from_sheet` once omitted columns and so silently wiped them on
> every Pull. Removing a key is the safe direction, but the round-trip test must
> confirm a Pull of a Franchise tab that still carries a stale `to_rewatch`
> column does not error.

### Calculate

Untouched. Rewatch marks are manual; nothing derives them.

## Migration

One Alembic revision, `down_revision` = whatever head is when this is
implemented — necessarily after `b872c435410b`, which created `plan_next`.

1. Add `kind` to `plan_next` as nullable, backfill every existing row to
   `'next'`, then set not-null. (Existing rows are all Watch Next.)
2. Drop `uq_plan_next_target`; create it over `(kind, scope, target_id,
   media_type)`. Drop `ix_plan_next_type_scope`; create
   `ix_plan_next_kind_type_scope` over `(kind, media_type, scope)`.
3. Backfill rewatch rows, `kind='rewatch'`:
   - one `scope='entry'` row per entry where `to_rewatch` / `to_reread` is true,
     with that entry's `media_type` — for `anime_movies`, `movies`, `tv_shows`,
     `manga`, `novel`, `comic`. **`cartoons` is excluded**: cartoon entry marks
     are discarded by design.
   - one `scope='franchise'` row per franchise where `to_rewatch` is true, one
     per media type that franchise actually holds entries of, intersected with
     the franchise-legal set (`anime`, `movie`, `tv-show`, `cartoon`, `novel`).
   - one `scope='series'` row per series where `to_rewatch` is true, one per
     media type that series actually holds entries of, intersected with the
     series-legal set (`movie`, `tv-show`, `novel`, `comic`).

   Types are read from the group's **actual child entries**, not from
   `franchise_type` — that column is multi-valued, bundles types (`ACG` implies
   anime and manga and novel, hence `hasNovel = types.includes("Novel") ||
   types.includes("ACG")` at `FranchisePage.jsx:255`), and carries an
   undocumented legacy `"Anime"` value at `:250`. A flagged group holding no
   entries of any legal type yields no rows.
4. Drop every remaining column, now that the rows are the source of truth:
   `to_rewatch` from `anime_movies`, `movies`, `tv_shows`, `cartoons`,
   `franchise` and `series`; `to_reread` from `manga`, `novel` and `comic`.
   This mirrors step 4 of the plan-next migration, which dropped the eight
   `watch_next` / `read_next` / `watch_next_group` columns for the same reason.

Downgrade reverses 4 to 1, accepting known loss: per-type detail collapses back
to one boolean, and discarded cartoon marks do not return.

## Frontend

### Data loading

`usePlanData` already fetches `/api/plan-next/` and `/api/comic/` after
plan-next Task 10. **It gains nothing.** The To Rewatch sections filter the rows
already in hand by `kind === "rewatch"`. No new endpoint, no new request.

`frontend/src/utils/planNext.js` and `frontend/src/config/planNextGroups.js`
gain the kind vocabulary and the per-kind scope map, mirroring the backend
module.

### Plan page

`PlanToRewatch.jsx` collapses the same way `PlanWatchNext.jsx` does in
plan-next Task 10 — today it is seven near-identical blocks each
re-implementing filter → sort → render. One config-driven path replaces them:

- **Comic becomes an eighth tab**, free once the loop is uniform.
- Within a tab, rows group into labelled sections by scope, in the order
  Franchise → Series → Entries, showing only the scopes that tab's type allows.
  Separate sections rather than a flat grid with level badges: it matches how
  Watch Next reads and keeps "rewatch this whole franchise" visually distinct
  from "rewatch this one film".
- Sorting within a section keeps today's behavior — by name EN.
- Cards are the ones Task 10 builds; franchise and series cards already carry a
  tier label.

A franchise marked under two media types appears on both tabs, which the
per-type rows now make explicit rather than inferred.

### Group-level admin UI

`FranchiseModifyTab.jsx`, `SeriesModifyTab.jsx`, `SeriesAddTab.jsx`, and the
inline-edit blocks in `FranchisePage.jsx` and `SeriesPage.jsx` replace the single
"To Rewatch" checkbox with a per-media-type toggle row, offering only the types
that group holds and that the mapping allows:

```
To Rewatch:  [x] Anime   [ ] Movie   [x] Novel
```

Labels read "To Reread" for novel and comic.

This sits directly beside the **next** toggle plan-next Task 9 adds to the same
blocks — the two should be built as one shared control taking `kind` as a prop,
which is the concrete reason to sequence this work after that task rather than
alongside it.

The `hasACG` gate on `FranchisePage.jsx:1108` (badge) and `:1181` (control) is
removed; visibility now follows the types the franchise actually holds. The badge
renders one chip per marked type.

### Comic

`Comic.jsx` gains the To Reread admin toggle. `ComicAddTab` and `ComicModifyTab`
already have it.

### Cartoon removal

Strip `to_rewatch` from `CartoonAddTab.jsx`, `CartoonModifyTab.jsx`,
`formFactories.js` (`defaultCartoon`), `Add.jsx`, and `Modify.jsx`. In
`Cartoon.jsx:395-415`, stop passing `toRewatch` and `onToRewatchChange` to
`MyTrackerCard` — that component already hides the control when
`onToRewatchChange` is undefined (`MyTrackerCard.jsx:151`), so no change is
needed there. `LibraryCartoon.jsx` has no rewatch column and needs no edit.

## Sequencing

This work must not start until plan-next reaches **Task 10**. Reasons, in order
of severity:

1. **Task 10 rewrites the Plan page** — `usePlanData.js` and the plan components
   are exactly the files this spec edits. Two sessions rewriting one file is the
   collision CLAUDE.md's "Concurrent Claude Code Sessions" section warns about.
2. **Task 9 builds the group-level admin UI** that this spec's per-type toggle
   row shares a control with.
3. **Task 5 builds the router** and **Task 7 the Sheets path** that `kind`
   extends.
4. `scope_allowed`'s signature change touches call sites those tasks create.

The other session should be told that `franchise.to_rewatch` and
`series.to_rewatch` are headed into `plan_next` too, so Task 9's group UI is
built as a kind-parameterised control rather than a next-only one.

## Testing

**Backend**

- `plan_next_kinds`: every kind covers every media type; `scope_allowed` agrees
  with the table above for all 16 kind/type pairs; the module assertions hold.
- Model: the four-column unique constraint permits the same target under both
  kinds and rejects a true duplicate.
- Router: `POST` without `kind` defaults to `"next"`; an illegal kind/type/scope
  triple is rejected (anime + entry + rewatch must fail, anime + entry + next
  must pass); `?kind=` filters; `DELETE /target` matches on the quadruple.
- Virtual fields: setting `to_rewatch=true` on a movie creates exactly one
  `kind='rewatch'`, `scope='entry'` row and reads back true; `false` deletes it;
  cartoon rejects the field; the cartoon list endpoint no longer accepts the
  filter.
- Migration: upgrade and downgrade against a seeded local DB. Fixtures must
  include a franchise holding two legal types, a franchise holding none, a
  series spanning two types, a flagged cartoon entry (asserted discarded), and
  pre-existing `plan_next` rows (asserted to become `kind='next'`).
- Sheets: Backup then Pull round-trips `kind`; a Franchise tab still carrying a
  stale `to_rewatch` column pulls without error.

**Frontend**

- The kind/scope map mirrors the backend for all 16 pairs (a table-driven test).
- Each tab renders only its legal scopes; a franchise marked under two types
  appears on both tabs and nowhere else.
- Verify on `:5173`, then `cd frontend && npm run build` before checking `:8000`.

## Documentation

- `database-schema.md` — `plan_next.kind`; state plainly that the table holds
  both kinds despite its name; remove the nine dropped `to_rewatch` /
  `to_reread` rows from their tables and note which survive as virtual fields.
- `options.md` — the `kind` vocabulary and the per-kind scope table.
- `api.md` — the `kind` parameter and body field; cartoon's dropped filter.
- `pages.md` — § To Rewatch, the franchise and series detail pages, cartoon forms.
- `business-logic.md` — the Pull parse path and the virtual-field mechanism.
- `current-plan.md` — mark comic's `to_reread` as no longer UI-less.

## Out of scope

- Renaming `plan_next`.
- Changing Watch Next's scope mapping.
- Manga or anime-movie gaining group scopes.
- Size buckets for rewatch rows.
- Per-mark metadata beyond the `remark` column `plan_next` already has.
