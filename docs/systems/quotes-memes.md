# Quotes and memes

Last verified: 2026-08-30 (commit 4339702)

## What this is for

Quotes are memorable lines pulled from a media entry; memes are pictures or
one-liners that belong to an entry *or* to a whole series, franchise or
collection. They used to live as a `quotes_memes` list inside each entry's
`notes` JSONB, which could not be filtered, searched or listed across the
library. They are now two small tables with their own routers, a shared
grouped-feed page component, and admin pickers that resolve the FK-less
owner references. This doc covers the tables, the owner-type vocabulary, the
endpoints, how visibility (RBAC) applies, the public pages, the admin tabs,
image storage and the Google Sheets tabs.

## Tables

Both models are in `app/models/quote.py` and `app/models/meme.py`. Column
declaration order is also the Google Sheets column order
(`format_model_for_sheet` walks `__table__.columns`).

### `quote`

| Column | Type | Notes |
|---|---|---|
| `system_id` | UUID PK | |
| `media_type` | text, indexed | one of the eight entry keys below; FK-less |
| `entry_id` | UUID, indexed | FK-less pointer into the table `media_type` names |
| `text` | text | the line itself |
| `translation` | text | |
| `language` | text | free text (`JP / CN / EN` placeholder) |
| `speaker` | text | |
| `original_source` | text | set when the speaker is quoting someone else |
| `episode` | text | where in the work |
| `link` | text | |
| `image_file` | text | file name under `static/quotes/` |
| `tags` | JSONB list | |
| `is_general` | bool | quote is not tied to a specific entry |
| `is_favorite` | bool | |
| `needs_review` | bool | |
| `sort_index` | float | manual order inside one entry's bucket |
| `remark` | text | |
| `created_at` / `updated_at` | datetime | Taipei time |

### `meme`

| Column | Type | Notes |
|---|---|---|
| `system_id` | UUID PK | |
| `owner_type` | text, indexed | one of the **eleven** owner keys below; FK-less |
| `owner_id` | UUID, indexed | FK-less pointer into the owner table |
| `text` | text | one text and/or one image — never a list |
| `image_file` | text | file name under `static/quotes/` (shared folder) |
| `quote_id` | UUID FK → `quote.system_id`, `ON DELETE SET NULL`, **unique** | set when the meme's text *is* a quote |
| `episode`, `link` | text | |
| `is_favorite` | bool | |
| `sort_index` | float | |
| `remark` | text | |
| `created_at` / `updated_at` | datetime | |

Why the references are FK-less: no single foreign key can span eight (or
eleven) tables. A deleted owner leaves a dangling row, which the resolver
reports as `missing: true` at read time instead of silently dropping it.
`quote_id` *is* a real FK because it points at exactly one table; its
`unique=True` is what guarantees a quote belongs to at most one meme.

## Owner types

Defined in `app/utils/media_resolver.py` and mirrored in the frontend pickers.

| Registry | Keys | Used by |
|---|---|---|
| `MEDIA_TABLES` | `anime`, `anime-movie`, `movie`, `tv-show`, `cartoon`, `manga`, `novel`, `comic` | `quote.media_type` |
| `TIER_TABLES` | `series`, `franchise`, `collection` (`is_tier=True`) | — |
| `OWNER_TABLES` = both | all eleven | `meme.owner_type` |

The stored key doubles as the frontend `MEDIA_CONFIG` key (hyphenated
spelling), so no translation table exists. Series has no hub page, so a
series-owned meme resolves with `owner_nav_path = null`; tiers have no cover
column, so `owner_is_tier` tells the UI to skip the thumbnail.

Quotes are entry-only. A meme owned by a tier therefore cannot link a quote,
and `MemeForm` hides the quote control for tier owners.

## Endpoints

Routers: `app/routers/quote.py` (`/api/quote`) and `app/routers/meme.py`
(`/api/meme`). Reads are public; writes need `get_current_admin`.

### Quotes

| Method | Path | Notes |
|---|---|---|
| GET | `/api/quote/` | filters `media_type`, `entry_id`, `is_general`, `is_favorite`, `needs_review`, `tag`, `search_query` (text, translation, speaker, original_source); `limit` ≤ 2000 (default 500), `offset`; newest first; returns `QuoteResolved[]` |
| GET | `/api/quote/grouped` | same filters minus `entry_id`; `limit` ≤ 5000 (default 2000); ordered by media_type, entry_id, `sort_index` NULLS LAST, created_at; returns `QuoteGroup[]` — one bucket per entry with the resolved header |
| GET | `/api/quote/{quote_id}` | 404 if the row is missing **or** its entry is hidden from the viewer |
| POST | `/api/quote/` | admin; `media_type` validated against `MEDIA_TABLES` → 400 on unknown |
| PUT / PATCH | `/api/quote/{quote_id}` | admin; PATCH follows the shared `_patching.py` rules |
| DELETE | `/api/quote/{quote_id}` | admin; logs a deleted record; `image_file` is left on disk |

`QuoteResolved` adds `missing`, `entry_display_name`, `cover_image_file`,
`franchise_id`, `entry_nav_path` and `meme_id`. `meme_id` is a reverse lookup
on `meme.quote_id` (`_meme_membership`), never stored on the quote, so there
is no second copy to keep in sync.

### Memes

| Method | Path | Notes |
|---|---|---|
| GET | `/api/meme/` | filters `owner_type`, `owner_id`, `is_favorite`, `search_query`; `limit`/`offset` as quotes; returns `MemeResolved[]` |
| GET | `/api/meme/grouped` | one `MemeGroup` per `(owner_type, owner_id)` with resolved owner header |
| GET | `/api/meme/{meme_id}` | 404 if missing or owner hidden |
| POST | `/api/meme/` | admin; `owner_type` validated against `OWNER_TABLES` → 400; `quote_id` already owned by another meme → 400 with the other meme's id (`_quote_conflict`); an IntegrityError (quote missing / already linked) → 400 |
| PUT / PATCH | `/api/meme/{meme_id}` | admin; same checks, excluding the meme itself from the conflict lookup |
| DELETE | `/api/meme/{meme_id}` | admin; the linked quote is **not** deleted; image left on disk |

`MemeResolved` folds in `quote_speaker` and `quote_translation` from the
linked quote plus `owner_display_name`, `owner_label` (`"Anime"`,
`"Franchise"`, …), `owner_is_tier`, `cover_image_file`, `franchise_id`,
`owner_nav_path`, `missing`.

Grouping is done server-side because only the server can turn a
`(type, id)` pair into a name and cover.

## Visibility

Quotes and memes carry their own text, so hiding the referenced entry is not
enough — the row itself is the leak. Every list, grouped and detail read calls
`drop_hidden_rows(db, viewer, rows, type_attr, id_attr)` from
`app/services/rbac/enforcement.py`:

- Superusers (and a `None` viewer) get everything.
- Otherwise the distinct `(type, id)` pairs are checked with
  `filter_visible_pairs` and rows whose pair is hidden are **dropped**, not
  degraded to `missing: true` (the UI reads `missing` as "dangling reference,
  go fix it", which would be a lie).
- Rows with no reference at all (general quotes) belong to no entry and are
  always kept.
- Detail endpoints turn a dropped row into a plain 404, matching the
  hidden-equals-missing rule in `authorization.md`.

## Public pages

| Route | File | Feed |
|---|---|---|
| `/quote` | `frontend/src/pages/public/Quotes.jsx` | `GET /api/quote/grouped` |
| `/meme` | `frontend/src/pages/public/Memes.jsx` | `GET /api/meme/grouped` |

Both render through `components/layout/GroupedEntryPage.jsx` and differ only
in their row component and filter bar. Filters are applied server-side (media
type / owner type, general-only, favourites-only, needs-review, search) so the
grouped shape and entry headers stay intact; the React Query keys are
`["quotes-grouped"]` and `["memes-grouped"]`. When an admin is logged in each
row offers inline edit (PATCH), favourite toggle (PATCH) and delete, all via
`endpoints.quotes.*` / `endpoints.memes.*` in `frontend/src/api/endpoints.js`.

## Admin UI

| Page | Tab | Component |
|---|---|---|
| Add | `quote` | `pages/add-tabs/QuoteAddTab.jsx` → `POST /api/quote/` |
| Add | `meme` | `pages/add-tabs/MemeAddTab.jsx` → `POST /api/meme/` |
| Modify / Delete | `quote` | `pages/modify-tabs/QuoteManageTab.jsx` (one component, `mode` prop) |
| Modify / Delete | `meme` | `pages/modify-tabs/MemeManageTab.jsx` (same pattern) |

### Pickers and forms (`frontend/src/components/forms/`)

| Component | Role |
|---|---|
| `ComboBox` | generic search-or-type control. Contract: `items: [{id,label}]`, `selectedId`, `inputText`, **`onSelect(id, label)`** when an existing item is picked, `onType(text)`, `onClear()`, `allowNew`, `required`. |
| `QuoteEntryPicker` | media-type `<select>` (`MEDIA_TYPE_OPTIONS`, eight keys) + a `ComboBox` over that type's list from `useMediaList`; calls `onChange(mediaType, id)`. Loads only the chosen type so admin pages don't fetch every library up front. |
| `MemeOwnerPicker` | same shape but `OWNER_TYPE_OPTIONS` (eleven keys, `tier` flag) and exports `isTierOwner()`. |
| `QuoteForm` | field editor; exports `emptyQuote()` and `toQuotePayload()`. |
| `MemeForm` | field editor; exports `emptyMeme()` / `toMemePayload()`. Given `ownerType`/`ownerId` it lists that entry's quotes (`endpoints.quotes.byEntry`) in a `ComboBox` for `quote_id`, and offers "create a quote from this text" which POSTs a quote for the same entry and links it. Hidden for tier owners. |

## Images

`app/main.py` creates `static/quotes/` at startup and mounts `/static`. Both
`quote.image_file` and `meme.image_file` are bare file names under that
folder, placed by hand — there is no upload endpoint and no GCS copy, unlike
covers. `getQuoteImageUrl()` in `frontend/src/lib/covers.js` returns
`/static/quotes/<file>` only when the app runs on localhost and `null`
otherwise, so production simply shows no image. Deleting a quote or meme
never touches the file.

## Google Sheets

`app/services/pipelines/tabs.py` registers `SheetTab("Quote", …)` then
`SheetTab("Meme", …)` — memes name quotes, so they are imported after them.
Parsers are `parse_quote_from_sheet` / `parse_meme_from_sheet`. On Pull
(`pipelines/pull.py`) an id-less row is matched on `(media_type, entry_id,
text)` for quotes and `(owner_type, owner_id, text)` for memes, so
re-importing the same sheet updates rather than duplicates. Blank timestamp
cells parse to `None`, which is why `created_at`/`updated_at` are optional in
the response schemas.

## Related

- `authorization.md` — `drop_hidden_rows`, 404-not-403.
- `systems/notes.md` — the notes registry that quotes were carved out of.
- `notes/decisions.md` (2026-08-23 Notes restructure) — "quotes entry-only,
  memes on all owners".
