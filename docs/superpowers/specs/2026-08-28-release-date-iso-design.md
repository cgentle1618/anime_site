# Release Date Storage: Truncated ISO-8601

**Date:** 2026-08-28
**Status:** Approved for planning

## Problem

Release dates are stored inconsistently across the eight media tables. Three
separate problems compound:

1. **Mixed types for one concept.** `novel.release_year` and
   `comic.release_year` are `Integer`; every other release column is `String`.
2. **Mixed formats within the String columns.** `movie.release_date_usa` holds
   `"JUL 2001"` or `"2001"`; `manga.release_year` holds `"2020"`; TMDB delivers
   `2001-07-20` and it is reformatted on the way in.
3. **Mixed shapes.** Anime splits one date across `release_year` and
   `release_month`, while every other type keeps a single column.

The cost is already visible: `watch_order._parse_release_value` carries a
tolerant parser that accepts `"2018-09-01"`, `"NOV 2025"`, `"2023"` and bare
integers, purely to paper over the schema. Any new feature that orders or
compares release dates has to reimplement or import that tolerance.

The requirement is exact dates where we have them, without pretending to a
precision we lack — many entries are known only to the month, or only to the
year.

## Decision: truncated ISO-8601 in a String column

Every release column becomes `String`, holding one of three shapes:

| Shape | Example | Meaning |
|---|---|---|
| `YYYY` | `"2024"` | Year known, month and day unknown |
| `YYYY-MM` | `"2024-05"` | Year and month known, day unknown |
| `YYYY-MM-DD` | `"2024-05-17"` | Exact date |

Precision is self-describing from the string's length, so no companion
precision column is needed. Lexicographic ordering equals chronological
ordering, which means the existing "missing precision resolves to the FIRST of
the period" rule in `watch_order` survives unchanged: `"2024"` sorts exactly
where `2024-01-01` does.

### Rejected alternative: `DATE` column plus a precision enum

The textbook shape is a real `DATE` normalized to the first of the period,
paired with a `*_precision` enum of `day` / `month` / `year`. It was rejected
because it doubles roughly twelve columns across eight tables, and every
formatter, form definition, API schema, and the Google Sheets column mapping
would have to learn about the companion field. The application performs no date
arithmetic beyond sorting and a single `<= today` comparison for airing status,
both of which truncated ISO handles directly. The cost is not repaid.

### Rejected alternative: free text

Free text is the status quo and is what created the problem.

## Schema changes

`release_date` is the name for every single-date type. The two multi-region
types keep their existing suffixed names.

| Table | Before | After |
|---|---|---|
| `anime` | `release_year` (String), `release_month` (String) | `release_date` (String) |
| `anime_movie` | `release_date_jp`, `release_date_tw` (String) | unchanged names, ISO format |
| `movie` | `release_date_usa`, `release_date_tw` (String) | unchanged names, ISO format |
| `tv_show` | `release_date` (String) | unchanged name, ISO format |
| `cartoon` | `release_date` (String) | unchanged name, ISO format |
| `manga` | `release_year`, `end_year` (String) | `release_date`, `end_date` (String) |
| `novel` | `release_year`, `end_year` (Integer) | `release_date`, `end_date` (String) |
| `comic` | `release_year`, `end_year` (Integer) | `release_date`, `end_date` (String) |

`anime.release_season` is unchanged and remains a stored column.

Every one of these columns carries a CHECK constraint enforcing the pattern
`^\d{4}(-\d{2}(-\d{2})?)?$` and stays nullable.

The documented rule that a release date cannot exceed its end date is enforced
by direct string comparison, which is correct for truncated ISO compared
against truncated ISO.

## The date helper module

A new module owns every operation on these values, so the format has exactly
one implementation:

- **parse** — a stored value to a `(year, month, day)` sort tuple, filling
  missing components with the first of the period. This is the existing
  `watch_order._parse_release_value` semantics, promoted out of that module.
- **validate** — the three legal shapes, plus real calendar validity for the
  month and day components. Used by the CHECK constraint's Pydantic
  counterpart on every affected schema.
- **normalize** — a source value (`"JUL 2001"`, `2001`, `2001-07-20`,
  `"2001-07"`) to the canonical stored form. Used by the migration and by
  autofill when mapping external API responses.
- **display** — the stored value rendered for the UI, never inventing
  precision the entry does not have.

`watch_order._parse_release_value` is deleted and its callers point at the
helper. `watch_order.release_display` keeps its current contract — it shows the
stored string rather than anything derived from the sort key, so a year-only
entry never renders an invented day.

## Priority resolution for multi-region types

`anime_movie` and `movie` keep both of their date columns; a JP release and a
TW release are different facts and collapsing them loses data. What becomes
explicit is which column represents the entry when a single date is needed.

`watch_order._RELEASE_FIELDS` is the single source of truth for that order and
is consulted by sorting, list display, and the airing-status derivation:

- `anime-movie`: `release_date_jp`, then `release_date_tw`
- `movie`: `release_date_tw`, then `release_date_usa` — **this is a flip**;
  the table currently lists `release_date_usa` first, which contradicts the
  intended priority.

Practical consequence for movies: TMDB autofills `release_date_usa` while the
TW date is entered manually, so most movies fall through to the USA date until
a TW date is supplied. That is expected behavior, not a gap.

`remarks.py` currently exposes `release_date_usa` as *the* date for movies in
its payload, which is inconsistent with TW priority. It is changed to resolve
through the same priority order.

## Anime season derivation

`release_season` remains stored and continues to be derived, with one rule
change to account for the merged column:

- When `release_date` has month-or-better precision, derive the season from
  its month component, as `calculate_seasonal_from_month` does today.
- When `release_date` is year-only, **leave `release_season` untouched**.

The second rule is load-bearing. `autofill.py` fills `release_season` directly
from the Tenrai response, independently of any month, so an anime can
legitimately carry a season without ever having had a month. Clearing the
season on year-only precision would destroy real data.

Three call sites read the anime year as a standalone value and switch to taking
the first four characters of `release_date`:

- `seasonal.create_missing_seasonal` — builds the `"WIN 2026"` seasonal string
- `seasonal.sync_seasonal_counts` — keys entries to their seasonal
- `routers/anime.py` — the `airing_season` query filter

A four-character prefix is exact for every legal value of the column, since all
three shapes begin with the year.

## Google Sheets round trip

This is the one place where the change can silently corrupt data.

`sheets.py` writes the backup matrix with `value_input_option="USER_ENTERED"`
and reads it back with `get_all_values`, which returns each cell's *displayed*
string. Today `"JUL 2001"` survives the round trip only because Sheets cannot
parse it. Once the value is `"2024-05-17"`, Sheets coerces it into a date cell
and returns it in the spreadsheet's locale format — `"5/17/2024"` — and
`"2024-05"` is coerced the same way. The corruption appears on the first
backup-then-pull cycle.

**Fix:** the release columns are written with a leading apostrophe, which
forces text in `USER_ENTERED` mode and is stripped from the value on read. The
write path needs to know which columns are release columns. That mapping —
model class to its release column names — is declared once in the date helper
module and read by `sheets.py`, rather than being restated per worksheet.

Flipping the entire write to `value_input_option="RAW"` was rejected as it
changes the behavior of every other column in the backup for the sake of this
one problem.

## Migration

A single Alembic revision performs the type changes and the data conversion.

Conversions, per source shape:

| Source | Result |
|---|---|
| `"JUL 2001"` | `"2001-07"` |
| `"2001"` | `"2001"` |
| `2020` (Integer) | `"2020"` |
| `"2001-07-20"` | `"2001-07-20"` (already canonical) |
| `NULL` | `NULL` |

Anime merges `release_year` and `release_month` into `release_date`: year plus
a recognized month name yields `YYYY-MM`, year alone yields `YYYY`.

**Unparseable rows are logged with their table, primary key, and raw value, and
left NULL — never silently discarded without a record.** An anime carrying a
`release_month` with no `release_year` is an orphan month with no meaningful
ISO form; the month is dropped and the row is logged.

The migration is written so the data step is inspectable before the column type
changes are applied, so a bad conversion is caught on a dry run rather than
after the fact.

## Implementation phases

Staged so each phase leaves the application working. This is ordering for
implementation, not three separate specs.

**Phase 1 — foundation.** The date helper module and its tests. The eight
models, their CHECK constraints, the Pydantic schema validators, and the
Alembic migration. At the end of this phase the data is converted and the
schema is correct.

**Phase 2 — backend logic.** `autofill.py` mapping for all four external
sources; `derivation.py` and `post_processing.py` for the season rule;
`seasonal.py` and `routers/anime.py` for the year prefix; `watch_order.py` for
the priority flip and the parser handoff; `remarks.py` for priority
resolution; `sheets.py` for the apostrophe.

**Phase 3 — frontend.** Roughly 329 references across ~30 files:
`formFactories.js` and `fieldMeta.js` for field definitions and input types,
`formatters.js` for display, `payloads.js`, `MediaCard.jsx`, the eight add
tabs, the eight detail pages, the library pages, and the admin
Add/Modify/Delete/ReviewQueue pages. Mechanical, and the bulk of the work by
file count.

**Phase 4 — documentation.** `docs/database-schema.md` for the new columns and
formats, `docs/business-logic.md` for the season derivation rule and the
priority resolution order, and `docs/integrations.md` for the Sheets apostrophe
handling.

## Testing

- **Helper module:** the three legal shapes round trip; illegal shapes are
  rejected; calendar-invalid values (`"2024-13"`, `"2024-02-30"`) are rejected;
  every historical source format normalizes to the expected canonical form.
- **Sorting:** an entry with `"2024"` sorts with, not before, an entry with
  `"2024-01-01"`; undated entries still sort last.
- **Priority:** a movie with only a USA date resolves to it; a movie with both
  resolves to TW.
- **Season derivation:** month-precision derives the season; year-only
  precision leaves an existing season intact.
- **Sheets:** a backup-then-pull round trip returns every release value
  byte-identical, covering all three precisions.
- **Migration:** exercised against a copy of production data, with the
  unparseable-row log reviewed before the migration is considered done.

## Out of scope

- Any change to `created_at`, `updated_at`, or `completed_at`, which are real
  `DateTime` columns and already correct.
- `broadcast_day` and `broadcast_time` on anime.
- Franchise and series tier tables, which carry no release columns.
