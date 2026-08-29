# To Rewatch / To Reread — Per-Type Levels

**Date:** 2026-08-29
**Status:** Design — awaiting review

## Problem

The Plan page's To Rewatch section currently reads the rewatch flag from exactly
one level per media type, and the mapping is accidental rather than chosen:

- **Anime** reads `franchise.to_rewatch` — forced, because the `anime` table has
  no `to_rewatch` column at all.
- **Every other type** reads the media entry's own boolean.
- **Series is read nowhere**, despite `series.to_rewatch` existing with full
  admin UI behind it (`SeriesAddTab`, `SeriesModifyTab`, a badge on `SeriesPage`).
- **Comic has no tab at all**; `comic.to_reread` is a column with no UI.

We want each media type to declare which of the three levels — franchise,
series, media entry — can carry the flag.

### The collision this exposes

`franchise.franchise_type` is multi-valued. It is parsed with `parseTypes()`
into a list, and `FranchisePage.jsx:250-260` derives `hasACG`, `hasMovie`,
`hasNovel` from it. A single franchise is routinely `ACG, Movie, Novel`.

But `franchise.to_rewatch` is a single boolean. Under the target mapping below,
five of the eight types read the franchise level. A mixed franchise marked for
rewatch would therefore surface on the Anime tab *and* the Movie tab *and* the
Novel tab, with no way to express "rewatch the anime, not the novels."

`series` has the same problem and no type column whatsoever — its own model
comment states a series holds "Any entry UUID, any type."

The media entry level has no such ambiguity: an entry is exactly one type.

## Target mapping

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

## Decision: keep the existing tables

**No new `rewatch_flag` table.** A dedicated table earns its keep when the flag
carries data — a date marked, a priority, a note, a history. This flag is a
bare boolean. A table would cost a new Google Sheets tab plus format/parse
paths in the backup and pull pipelines, a join on every Plan page load and
library filter, and the loss of the flag as a directly readable per-type sheet
column — all for normalization with no new capability. If per-flag metadata is
ever wanted, that is the moment to promote it.

The two levels are handled differently, because only one of them is ambiguous:

**Media entry level — unchanged.** Keep the plain booleans on `anime_movie`,
`movie`, `tv_show`, `manga`, `novel`, `comic`. One type per entry, no ambiguity.

**Group level — same tables, new column type.** Replace the single boolean on
`franchise` and `series` with a per-type JSONB list:

```
franchise.to_rewatch_types = ["ACG", "Movie"]
series.to_rewatch_types    = ["Movie"]
```

This is not a novel pattern in this codebase. `franchise.type_covers` and
`franchise.type_slots` (`app/models/franchise.py:57-58`) already solve the same
"one franchise, many types" problem with per-type JSONB, and the Sheets Pull
already has `_safe_json` handling wired for both
(`formatter.py:parse_franchise_from_sheet`). `to_rewatch_types` slots into
existing machinery rather than adding new machinery.

The column keeps the `to_rewatch` stem at group level even though it also serves
Novel and Comic reread semantics — matching the existing precedent where
`series.to_rewatch` already served both. UI labels read "To Reread" in novel and
comic contexts.

### Values

`to_rewatch_types` holds **media type** values, not Franchise Type values:
`Anime`, `Movie`, `TV Show`, `Cartoon`, `Novel`, `Comic` — one per Plan tab that
uses a group level.

This deliberately does *not* reuse the `franchise_type` vocabulary. That
vocabulary bundles types (`ACG` implies anime *and* manga *and* novel — hence
`hasNovel = types.includes("Novel") || types.includes("ACG")` at
`FranchisePage.jsx:255`) and carries legacy values the options list does not
document (`FranchisePage.jsx:250` accepts a bare `"Anime"` alongside `"ACG"`).
Bundled values cannot express "rewatch the anime, not the novels," which is the
whole point of this change.

Per level, only values that level supports are valid:

- franchise: `Anime`, `Movie`, `TV Show`, `Cartoon`, `Novel`
- series: `Movie`, `TV Show`, `Novel`, `Comic`

The admin UI further narrows the offered checkboxes to types the group actually
holds, using the per-type entry lists those pages already build (`animeList`,
`movieList`, … on `FranchisePage`) rather than the `franchise_type` string.

`null` and `[]` both mean "not marked."

## Migration

One Alembic revision:

1. Add `to_rewatch_types` JSONB (nullable) to `franchise` and `series`.
2. Backfill where `to_rewatch = true`, from the **actual child entries** of that
   group — not from `franchise_type`, which is bundled and partly legacy. For
   each group, collect the distinct media types of its entries and intersect
   with that level's valid values above. A franchise holding anime and movies
   becomes `["Anime", "Movie"]`; one holding only anime becomes `["Anime"]`.
   A flagged group with no entries becomes `[]`.
3. Drop `franchise.to_rewatch` and `series.to_rewatch`.
4. Drop `cartoon.to_rewatch`.

Step 4 discards existing cartoon entry-level rewatch marks. This is intentional
— cartoon moves to franchise-only and no consumer remains.

Downgrade restores the three boolean columns and sets each to true where
`to_rewatch_types` was non-empty; per-type detail is lost on downgrade, which is
acceptable for a flag of this kind.

## Backend changes

- **`app/models/franchise.py`** — swap the column on both `Franchise` and
  `Series`.
- **`app/models/cartoon.py`** — drop `to_rewatch`.
- **`app/schemas/franchise.py`** — `to_rewatch: Optional[bool]` becomes
  `to_rewatch_types: Optional[list[str]]` on both the Franchise and Series
  schema pairs.
- **`app/schemas/cartoon.py`** — drop `to_rewatch`.
- **`app/registry.py:115`** — cartoon loses `to_rewatch` from `list_filters`.
  Cartoon is the only entry type that exposed it as a query param; movie and
  tv_show use `movie_type` / `region` in that slot.
- **`app/utils/formatter.py`** — `parse_franchise_from_sheet` and
  `parse_series_from_sheet` switch from `parse_from_sheet(..., bool)` to
  `_safe_json`; `parse_cartoon_from_sheet` drops the key. The movie and tv_show
  parsers are unchanged.
- **Backup needs no code change** — sheet headers are derived from
  `__table__.columns` (`backup.py:141-149`), so the Franchise, Series and
  Cartoon tabs pick up the new shape automatically. The existing sheet's stale
  columns are overwritten on the next Backup.

## Frontend changes

### Group-level admin controls

`FranchisePage`, `FranchiseModifyTab`, `SeriesPage`, `SeriesModifyTab` and
`SeriesAddTab` replace the single "To Rewatch" checkbox with a checkbox row,
offering only the types that group actually holds:

```
Mark for rewatch:  [x] Anime   [ ] Movie   [x] Novel
```

The `hasACG` gate on `FranchisePage.jsx:1108` (badge) and `:1181` (control) is
removed — visibility is now driven by which types the franchise holds, which
`parseTypes()` already provides. The badge renders one chip per marked type.

### Plan page

`usePlanData` additionally loads series and comics, and builds an
`allEntriesBySeries` map keyed by `series_id` alongside the existing
`allEntriesByFranchise`.

`PlanToRewatch` tabs:

- **Anime** — franchise section only, filtered to `to_rewatch_types` containing
  `Anime`. (Existing behavior, newly type-aware.)
- **Anime Movie** — entries only. Unchanged.
- **Movie / TV Show / Novel** — three labelled sections in order: Franchise,
  Series, Entries.
- **Cartoon** — franchise section only, filtered to `to_rewatch_types`
  containing `Cartoon`.
- **Manga** — entries only. Unchanged.
- **Comic** — new tab: Series section, then Entries.

Levels render as separate labelled sections rather than one flat grid with level
badges. This matches how Watch Next already reads and keeps "rewatch this whole
franchise" visually distinct from "rewatch this one film."

A franchise flagged for several types appears on each corresponding tab. With
`to_rewatch_types` this is now explicit intent rather than inference.

Series covers resolve through the same path as franchise covers —
`getCoverForSlot` against `allEntriesBySeries`, honoring `series.cover_entry_id`
with a newest-entry fallback.

### Comic

`Comic.jsx` gains the To Reread admin toggle. `ComicAddTab` and `ComicModifyTab`
already have it.

### Cartoon removal

Strip `to_rewatch` from `CartoonAddTab`, `CartoonModifyTab`, `Cartoon.jsx`,
`formFactories.js`, `Add.jsx`, `Modify.jsx`, and the cartoon library table
column and filter.

## Testing

- Migration: upgrade and downgrade against a seeded local DB; verify backfill
  for a mixed-type franchise, a single-type franchise, and a series whose
  entries span two types.
- API: franchise and series create/update round-trip `to_rewatch_types`
  including `null` and `[]`; cartoon ignores `to_rewatch`; the cartoon list
  endpoint no longer accepts the filter.
- Sheets: Backup then Pull round-trips `to_rewatch_types` on both group tabs
  without wiping it (the failure mode `business-logic.md:1548` records for the
  other JSONB franchise columns).
- Manual: each Plan tab shows the right levels; a franchise marked for two types
  appears on both tabs and nowhere else.
- Frontend verification on `:5173`, then `npm run build` before checking `:8000`.

## Documentation

`database-schema.md` (franchise, series, cartoon), `options.md` (new
`to_rewatch_types` vocabulary per level), `api.md` (cartoon filter removal,
Franchise/Series body fields), `pages.md` (§ To Rewatch, franchise/series detail
pages, cartoon forms), `business-logic.md` (Pull parse path).

## Out of scope

- Watch Next levels — unchanged.
- Manga gaining series or franchise levels.
- Adding a `to_rewatch` column to the `anime` table.
- Any per-flag metadata (date marked, priority, notes).
