# Public ID + Slug URLs — Design

Date: 2026-09-07
Status: approved design, not yet planned

## Problem

Every detail page in the SPA is addressed by its raw UUID primary key:

```
/anime/3f8b0c2a-9d1e-4c7b-a0f2-1d4e7f905b3c
/franchise/4d1e7f90-2c8a-4b11-9e6d-0a3f8b0c24d1
```

The URL is unreadable, unmemorable, un-sayable, and exposes an internal
identifier for no benefit. The goal is a URL a human can read, and one that
does not show a system id.

## Decisions

| Question | Decision |
|---|---|
| URL shape | `/<type>/<public_id>/<slug>` — short id first, slug trailing |
| Id source | A stored `public_id` column, **not** a truncated UUID |
| Id format | Per-type sequential integer starting at 1 |
| Back-compat | None. Bare-UUID browser URLs stop working |
| Scope | Every entity with a detail page (17 tables) |
| Slug source | Latin-first name chain, independent of the CN-first display name |
| Slug role | Decorative. Lookup uses `public_id` alone |

### Why a stored column, not a UUID prefix

A truncated UUID (`/anime/a3f8b0c24d1e/...`) needs no migration, but it reads as
a UUID that got cut off — which is exactly what this change is trying to remove.
The UUID-inside / short-id-outside split is the standard design when the primary
key is a UUID, and it is what every comparable catalogue does: MyAnimeList
(`/anime/5114/Fullmetal_Alchemist`), TMDB (`/movie/550-fight-club`), IMDb
(`/title/tt0944947/`).

### Why sequential, not a random code

Random short codes (`K9mQ2vBn`) are the convention for resources where the URL
*is* the access control — unlisted videos, share links. That is not this app:
RBAC and content labels decide what a viewer may see, and `_get_or_404`
(`app/routers/_factory.py:43-50`) already returns an identical 404 for a hidden
entry and a nonexistent one, so enumeration reveals nothing the library page
does not.

The accepted cost: `public_id` leaks collection size and creation order. For a
personal collection shown to friends, that is not a secret worth uglier URLs.

Deletions leave permanent gaps in the sequence. That is expected and harmless;
ids are never reused.

## URL scheme

```
/anime/47/fullmetal-alchemist-brotherhood
/manga/12/berserk
/franchise/8/fullmetal-alchemist
/person/203/hiroshi-kamiya
/anime/93                                  <- CN-only entry, slug omitted
```

- `public_id` is unique **per table**, so `/anime/47` and `/manga/47` are
  different entries. This matches the existing per-type route prefixes.
- The slug segment is optional and never read. `/anime/47`,
  `/anime/47/wrong-slug` and `/anime/47/fullmetal-alchemist-brotherhood` all
  resolve to the same entry.
- On load, if the slug segment differs from the canonical slug, the page issues
  `history.replaceState` to the canonical path. Renames self-heal; no redirect
  table is needed.

## Data model

A new column on each of the 17 entity tables:

```
public_id INTEGER NOT NULL
```

with a unique index per table (`uq_<table>_public_id`) and a dedicated Postgres
sequence per table (`<table>_public_id_seq`) as the server default.

Tables in scope:

| Group | Tables |
|---|---|
| Media entries (9) | `anime`, `anime_movies`, `movies`, `tv_shows`, `cartoons`, `manga`, `novel`, `comic`, `games` |
| Grouping tiers (3) | `collection`, `franchise`, `series` |
| Entities (4) | `person`, `studio`, `publisher`, `character` |
| Other (1) | `watch_order_list` |

Out of scope: `seasonal` (already addressed by `seasonal_id`, not a UUID), and
every table without a detail page — `note`, `quote`, `meme`, `media_credit`,
`media_source`, `media_relation`, `plan_next`, `novel_unit`, `game_copy`,
`character_casting`, the option vocabulary tables, `content_label`.

### Assignment

`public_id` comes from the table's sequence via a server-side default, so any
insert path — the Add forms, the Pull pipeline, a Replace, a test fixture — gets
one without knowing the column exists.

The Alembic migration must, per table:

1. Add the column as nullable.
2. Backfill by `created_at` ascending with `NULLS LAST`, `system_id` ascending
   as the tiebreak, so the numbering matches the order entries were added and is
   reproducible. Every table in scope has `created_at`, but it is nullable on
   the entity tables, so the ordering must not depend on it alone.
3. Create the sequence, `setval` it past the backfilled maximum, attach it as
   the column default.
4. Set the column `NOT NULL` and add the unique index.

### Sheet round trip

`public_id` is a real column, so the Backup pipeline picks it up automatically
from `__table__.columns` (`app/services/pipelines/backup.py:40`) and writes one
new column on each of the 17 affected tabs. It must **not** be added to
`drop_columns`: an id that regenerated on every Pull would silently change every
URL when work moves between the company and home machines.

Two consequences for Pull:

- Each of the 17 `parse_*_from_sheet` functions in `app/utils/formatter.py` is
  an explicit whitelist and needs a `public_id` line. A parser that omits it
  drops the value and the row is renumbered on restore.
- After restoring a tab, Pull must `setval` the table's sequence past the
  highest restored `public_id`. Without this the sequence still sits where the
  local database left it and the next insert collides with the unique index.

A sheet written before this change has no `public_id` column. Restoring it must
not fail: a missing value falls through to the sequence default, and the entry
is renumbered. This is a one-time cost on the first Pull after the migration —
back up from the newer machine first, as usual.

## Backend

The API continues to speak UUIDs everywhere. `public_id` is an addressing
convenience for the detail-page fetch only; every write, credit reference,
relation and cover call keeps using `system_id`.

Concretely, the single-entry GET on each router accepts either form:

- a value that parses as an integer → look up by `public_id`
- anything else → parse as a UUID and look up by `system_id` as today

This is one branch in `_get_or_404` (`app/routers/_factory.py:43`) for the nine
media types, plus the equivalent in the hand-written routers for the other
eight. Visibility checks are unchanged and still run after the row is found, so
a hidden entry 404s identically whichever id was used.

`public_id` is added to each response schema and must **not** be placed in an
RBAC field group — it is needed to build a link to a page the viewer is already
allowed to see.

## Frontend

### One path helper

The scheme is currently open-coded at roughly 40 sites as
`` to={`/anime/${e.system_id}`} ``. All of them move to a single helper:

```js
// frontend/src/lib/entityPath.js
entityPath("anime", entry)   // -> "/anime/47/fullmetal-alchemist-brotherhood"
```

It takes the route type and the entity, reads `public_id`, appends the slug when
one can be derived, and is the only place that knows the URL shape.

### Slug derivation

Derived on the fly, never stored, so it can never go stale:

1. Pick the first non-empty of `<prefix>_name_en`, `<prefix>_name_roman`,
   `<prefix>_name_alt` (`name_en`, `name_alt` for person/studio/publisher/
   character; `list_name` for watch orders).
2. Lowercase, NFKD-normalise, strip combining marks, drop any remaining
   non-ASCII.
3. Replace runs of non-alphanumerics with `-`, collapse repeats, trim leading
   and trailing `-`.
4. Truncate to 60 characters at a `-` boundary.
5. If the result is empty, omit the slug segment entirely.

This deliberately ignores `getDisplayName` (`frontend/src/lib/naming.js:16`),
which leads with the Chinese name for every type but comic. The UI keeps showing
CN names; only the URL prefers Latin script. An entry with no Latin name gets
`/anime/93` and no slug rather than a percent-encoded slug.

### Routes

Each detail route in `App.jsx` gains an optional trailing segment:

```
/anime/:publicId/:slug?
```

Pages read `publicId`, fetch by it, and use the returned `system_id` for
everything else. On a successful load, canonicalise the path with
`replaceState` when the slug segment does not match.

## Testing

- **Migration**: backfill numbers by `created_at` then `system_id`; sequence
  starts past the maximum; the unique index rejects a duplicate.
- **Backend**: fetching by `public_id` returns the same entry as fetching by
  `system_id`; a hidden entry 404s by `public_id` with the same message; an
  unknown `public_id` 404s; `public_id` appears in the response for a viewer
  with the narrowest role.
- **Pipelines**: Backup writes the column on every affected tab; Pull restores
  it unchanged and a round trip preserves every id; a sheet with no `public_id`
  column restores without error; the sequence is advanced past restored values,
  and an insert straight after a Pull succeeds.
- **Frontend**: `entityPath` output for a Latin name, a CN-only name, a name
  with punctuation, and an over-long name; slug mismatch triggers
  canonicalisation; a page loads with no slug segment.

## Risks

1. **First Pull after the migration renumbers everything** if the sheet predates
   the change. Mitigated by running Backup from the newer machine before
   pulling anywhere.
2. **Sequence drift after Pull** is the failure that bites later, not at restore
   time — the next insert fails on the unique index. The `setval` step is the
   fix and needs a test that inserts immediately after a Pull.
3. **Wide but shallow diff** — 17 tables, 17 parsers, one shared router factory
   plus 8 hand-written routers, and ~40 link sites. Nothing is hard; the risk is
   a missed site left pointing at a UUID
   URL that now 404s, since there is no back-compat. A grep for the old
   inline link pattern should come back empty after the change.
