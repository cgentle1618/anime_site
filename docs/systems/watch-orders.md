# Watch Orders

Last verified: 2026-08-30 (commit 4339702)

## What this is for

A watch order is a named, ordered guide through a group of media entries — "watch A ep 1-10, then movie B, then A ep 11-12" — owned by one franchise, series or collection. It replaced the old per-entry `watch_order` float (dropped in `alembic/versions/drop_entry_watch_order.py`), which could not span media types, hold more than one order per franchise, or split one entry across two steps. Orders come in two flavours: **hand-built** lists whose steps are stored rows, and **built-in** ("generated") lists whose steps are computed from release dates every time they are read. Guests can read every order; every write is admin-only.

## Model

Three tables, defined in `app/models/watch_order.py`. Migrations: `alembic/versions/t3u4v5w6x7y8_add_watch_order_tables.py` (list + item), `ws1e2c3t4i5n_add_watch_order_section.py` (section), `x7y8z9a0b1c2_add_watch_order_auto_source.py`, `wo_item_importance.py`, `wo_flatten_section_order.py`, `wo_series_owner_series_and_no_builtin.py` (series owner + `collection.no_built_in_orders`).

### `watch_order_list` — one order

| Column | Type | Null | Notes |
| --- | --- | --- | --- |
| `system_id` | UUID | PK | indexed |
| `franchise_id` | UUID | yes | FK `franchise.system_id`, ON DELETE CASCADE, indexed |
| `collection_id` | UUID | yes | FK `collection.system_id`, ON DELETE CASCADE, indexed |
| `series_id` | UUID | yes | FK `series.system_id`, ON DELETE CASCADE, indexed |
| `list_name` | String | yes | `display_name` property falls back to "Untitled Order" |
| `list_type` | String | yes | default `"Custom"`; UI offers Custom / Chronological / Release / Recommended (`LIST_TYPES` in `frontend/src/components/tracker/WatchOrderEditor.jsx`) — not validated server-side |
| `is_default` | Boolean | yes | default False; at most one per owner (see Rules) |
| `is_most_recommended` | Boolean | yes | default False; at most one per owner, independent of `is_default` |
| `auto_source` | String | yes | NULL = hand-built; `"release"` or `"release-anime"` = built-in |
| `sort_index` | Float | yes | manual ordering among an owner's lists |
| `remark` | Text | yes | shown above the guide |
| `created_at` / `updated_at` | DateTime | yes | Taipei time |

Constraint `ck_watch_order_list_single_owner`: exactly one of `franchise_id`, `collection_id`, `series_id` is non-null. Owner FKs cascade (not SET NULL like Collection→Franchise) because a nulled owner would violate that check. No unique constraint on names; only the indexes listed above.

### `watch_order_section` — an optional "part" inside a list

| Column | Type | Null | Notes |
| --- | --- | --- | --- |
| `system_id` | UUID | PK | indexed |
| `list_id` | UUID | no | FK `watch_order_list.system_id`, ON DELETE CASCADE, indexed |
| `position` | Float | yes | only matters while the part has no steps (anchors it in the item stream) |
| `section_name` | String | yes | `display_name` falls back to "Untitled Section" |
| `remark` | Text | yes | printed under the part heading |
| `created_at` / `updated_at` | DateTime | yes | |

### `watch_order_item` — one step

| Column | Type | Null | Notes |
| --- | --- | --- | --- |
| `system_id` | UUID | PK | indexed |
| `list_id` | UUID | no | FK `watch_order_list.system_id`, ON DELETE CASCADE, indexed |
| `position` | Float | yes | reading order; float so a step can be slotted between two others |
| `media_type` | String | yes | one of the eight slugs in `MEDIA_TYPE_MODELS` |
| `entry_id` | UUID | yes | **no FK** — points at whichever table `media_type` names; indexed |
| `section_id` | UUID | yes | FK `watch_order_section.system_id`, ON DELETE **SET NULL**, indexed |
| `ep_start` / `ep_end` | Integer | yes | both null = the whole entry |
| `importance` | String | yes | default `"Normal"`; one of `ITEM_IMPORTANCE` |
| `note` | Text | yes | per-step commentary |
| `created_at` / `updated_at` | DateTime | yes | |

The same entry may appear in several items of one list (a split run). A deleted entry leaves a dangling item that the reader flags as `missing: true` rather than dropping (`resolve_items` in `app/services/domain/watch_order.py`; proved by `test_dangling_entry_is_flagged_not_dropped`).

### Constants (`app/services/domain/watch_order.py`, `app/routers/watch_order.py`)

| Name | Value | Where |
| --- | --- | --- |
| `MEDIA_TYPE_MODELS` | anime, anime-movie, movie, tv-show, cartoon, manga, novel, comic | domain |
| `ITEM_IMPORTANCE` | `("Essential", "Recommended", "Normal", "Optional")`; `DEFAULT_IMPORTANCE = "Normal"` | domain; mirrored in `WatchOrderEditor.jsx` |
| `BUILT_IN_KINDS` | `release` → "Release Order", all types; `release-anime` → "Release Order (Anime)", anime only | router |
| `MIN_ENTRIES_FOR_RELEASE` | `2` — an owner with fewer entries in scope gets no built-in order | router |
| `_SINGLE_WINNER_FLAGS` | `is_default`, `is_most_recommended` | router |
| `_TOTAL_FIELDS` | anime/tv-show/cartoon → `ep_total`; manga/novel → `ch_total`; comic → `issue_total`; movie types have none | domain |
| `_STATUS_FIELDS` | watching_status for the five watched types, reading_status for manga/novel/comic | domain |

## Rules

| Rule | Where enforced |
| --- | --- |
| Reading order is `position` alone (NULL sorts last, stable). Parts do not sort the guide; a part is drawn around whichever run of adjacent steps shares a `section_id`, so an unfiled step may sit before, between or after parts. | `sort_items_by_reading_order`, list-detail query; `TestPartsDoNotSortTheGuide` |
| A part's steps must be contiguous. Reorder rejects (400) an order that would split a part, checked on the prospective order before any row is written. | `first_section_break`; reorder endpoint; `TestPartsStayContiguous` |
| A new unfiled step appends after the highest position (`_next_position`). A step added with a `section_id` lands at the end of *that part's run* — midpoint between the part's last step and the next item — so the part stays unbroken. First step of an empty part appends to the list. | `_append_position`; `TestAddingAStepToAPart` |
| A step may only reference a section of its own list (400 otherwise). | `_validate_section` |
| `media_type` must be a known slug and `entry_id` must exist in that table (400). | `_validate_entry`, `entry_exists` |
| `importance` must be one of the four rungs (400). The Sheets parser instead coerces junk to "Normal" (`normalize_importance`). | `_validate_importance` |
| Exactly one owner (400 mirrors the DB check). | `_validate_owner` |
| Setting `is_default` or `is_most_recommended` on a list clears that flag on the owner's other lists. The two flags are independent. | `_enforce_single_winners`; `TestMostRecommended` |
| Built-in lists have no item/section rows; every item/section/reorder write is refused with 400. Name, type, remark, flags and delete still work. | `_reject_if_generated`; `TestGeneratedListIsReadOnly` |
| Built-in steps are generated on every read from `list_candidate_entries` sorted by `release_sort_key` (per-type column priority in `app/utils/release_date.py: RELEASE_PRIORITY`), then name; undated entries sink to the bottom. Positions renumber 1..N; `system_id` of a generated step is the entry id; every step is whole, "Normal", no note. | `build_release_items`; `TestReleaseOrder` |
| Built-in creation is idempotent per kind, refused when fewer than 2 entries are in scope, and refused for a franchise whose collection has `no_built_in_orders = true` (`app/models/collection.py`). | `create_release_list`; `TestSingleWorkFranchisesGetNoOrder`, `TestCollectionOptOut` |
| Anime-only kind counts only anime entries; both kinds may coexist on one owner. Collections get the cross-type kind only. | `_count_owner_entries`, backfill; `TestAnimeOnlyBuiltIn` |
| Series-owned orders draw on `series_id`; `anime_movies` has no `series_id`, so anime movies never appear in a series scope. | `list_candidate_entries`; `TestSeriesOwnedBuiltIn` |
| Duplicate copies owner, type, remark, sort_index and every step into a new hand-built list named "… (Copy)", clears both winner flags, and always sets `auto_source = NULL` — this is how a built-in order becomes editable. | `duplicate_watch_order_list`; `TestDuplicateWatchOrderList`, `TestDuplicateGeneratedList` |
| `item_count` and `media_types` are derived, never stored; `media_types` is in the fixed `MEDIA_TYPE_MODELS` order (single type = single-type order, several = cross-type). | `_summarize`, `_summarize_generated`, `_ordered_types`; `TestMediaScope` |
| Listing sort: `is_most_recommended` desc, `is_default` desc, `sort_index` asc, `list_name` asc. | `get_watch_order_lists` |

### Range fields and units

`ep_start`/`ep_end` are generic integers; what they count depends on the step's media type. The unit and the "whole-only" rule live in `frontend/src/components/tracker/WatchOrderGuide.jsx` (the `frontend/src/utils/watchOrderRange.js` path does not exist; its test is `frontend/src/components/tracker/watchOrderRange.test.js`):

| Media type | Range unit label | Range inputs offered? (`supportsEpisodeRange`) |
| --- | --- | --- |
| anime, tv-show, cartoon | `Ep` | yes |
| comic | `#` (issue) | yes |
| manga, novel | `Ch` | **no** — `WHOLE_ONLY_TYPES` |
| movie, anime-movie | `Ep` (never shown) | **no** — `WHOLE_ONLY_TYPES` |
| unknown / null | `Ep` | yes (nothing is lost for an unrecognised type) |

`rangeLabel` renders "Ep 1-10", "Ep 5", "Ch 1-40", "# 1-12", "Ep 5+" or "Ep up to 10". A stored range on a whole-only type is still displayed; the editor just hides the inputs rather than clearing data. The backend does not validate ranges against the type. Anime steps also get `ep_special` resolved (the episode number a special sits at; 0 is a real value).

### Viewer visibility

Reads apply RBAC (`app/services/rbac/enforcement.py`): the list-detail endpoint passes the `Viewer` into `resolve_items`, which calls `drop_hidden_rows` for non-superusers — hidden entries are *removed* from the guide, not flagged missing. The candidates endpoint passes the viewer into `list_candidate_entries`, which wraps each table query in `apply_entry_visibility`. Built-in lists are generated without a viewer (`build_release_items` never receives one), so their steps are **not** visibility-filtered. Reorder responses call the detail handler with `viewer=None` (admin-only anyway).

## API

Router: `app/routers/watch_order.py`, prefix `/api/watch-order`. Schemas: `app/schemas/watch_order.py`. Admin = `Depends(get_current_admin)` (401 for guests, proved throughout `tests/api/test_watch_order.py`).

| Method | Path | Auth | Params / body | Response | Errors |
| --- | --- | --- | --- | --- | --- |
| GET | `/lists` | public | query `franchise_id`, `collection_id`, `series_id`, `search_query` (ilike on name), `auto` = `exclude` \| `only`, `limit` 1–2000 (500), `offset` | `[WatchOrderListResponse]` (no items) | — |
| GET | `/lists/{system_id}` | public (viewer-filtered) | — | `WatchOrderListDetailResponse`: list + `items` (resolved, flat, reading order) + `sections` | 404 |
| GET | `/candidates` | public (viewer-filtered) | exactly one of `franchise_id`, `collection_id` | `[WatchOrderCandidate]` sorted by type then name; includes `search_names` for the picker | 400 if zero or two owners |
| POST | `/lists` | admin | `WatchOrderListCreate` | `WatchOrderListResponse` | 400 owner rule; 500 on DB error |
| POST | `/lists/release` | admin | query: one owner id, `anime_only` bool | existing or new built-in list | 400 owner rule / opted-out collection / < 2 entries |
| POST | `/lists/release/backfill` | admin | — | `{status, created, skipped_too_small, skipped_opted_out}` | — |
| PUT | `/lists/{id}` | admin | `WatchOrderListUpdate` (unset fields untouched) | list | 404, 400 owner |
| PATCH | `/lists/{id}` | admin | dict, columns whitelisted by `apply_column_patch` (`app/routers/_patching.py`) | list | 404, 400 |
| DELETE | `/lists/{id}` | admin | — | `{status, message}`; items and sections cascade; logs via `log_deleted_record` | 404 |
| POST | `/lists/{id}/duplicate` | admin | — | new list | 404, 500 |
| POST | `/lists/{id}/items` | admin | `WatchOrderItemCreate` (`media_type`, `entry_id`, `section_id`, `position`, `ep_start`, `ep_end`, `importance`, `note`) | `WatchOrderItemResponse` (no display data) | 404; 400 generated / bad type / missing entry / bad importance / foreign section |
| PUT | `/items/{id}` | admin | `WatchOrderItemUpdate` | item | 404, 400 as above |
| PATCH | `/items/{id}` | admin | dict | item | 404, 400 |
| DELETE | `/items/{id}` | admin | — | `{status, message}` | 404, 400 generated |
| PUT | `/lists/{id}/reorder` | admin | `{item_ids: [...], section_ids?: [...]}` — every item exactly once; `section_ids` parallel, null = unfiled | full detail response | 400 duplicate ids / partial payload / length mismatch / foreign section / split part |
| POST | `/lists/{id}/sections` | admin | `WatchOrderSectionCreate` (`section_name`, `position`, `remark`) | `WatchOrderSectionResponse` | 404, 400 generated |
| PUT | `/sections/{id}` | admin | `WatchOrderSectionUpdate` | section | 404, 400 generated |
| PATCH | `/sections/{id}` | admin | dict | section | 404, 400 generated |
| DELETE | `/sections/{id}` | admin | — | `{status, message}`; steps become unfiled (SET NULL) | 404, 400 generated |
| PUT | `/lists/{id}/sections/reorder` | admin | `{section_ids: [...]}` every section exactly once; renumbers 1..N | full detail response | 400 duplicate / partial |

Frontend endpoint map: `frontend/src/api/endpoints.js` (`endpoints.watchOrder.*`).

## UI

| Surface | File | Notes |
| --- | --- | --- |
| Hub tab (Franchise / Series / Collection page) | `frontend/src/components/tracker/WatchOrderSection.jsx`, mounted from `pages/detail/FranchisePage.jsx`, `SeriesPage.jsx`, `CollectionPage.jsx` | Loads the owner's lists, opens the first (backend sorts most-recommended → default first). Scope filter (cross-type vs single type) when scopes differ; chips up to `CHIP_LIMIT = 6`, dropdown beyond; Custom group before Built-in. Draws at most `INLINE_STEP_LIMIT = 10` steps with a "See all" link. Admin gets "Add built-in" (cross-type kind only) and an "Edit" link. |
| Full page `/watch-order/:system_id` | `frontend/src/pages/detail/WatchOrderPage.jsx` (wrapped by `pages/detail/WatchOrder.jsx`, route in `App.jsx`) | Roomy guide, owner back-link, sibling orders. Owner is resolved as franchise-or-collection only; a series-owned order's back-link falls through to collection with a null id. |
| Guide renderer | `frontend/src/components/tracker/WatchOrderGuide.jsx` | `buildBlocks` folds the flat item list into part boxes and loose runs (tests in `WatchOrderGuide.test.jsx`). Filters: All / Hide optional / Essentials only, shown only when they would change something; step numbers follow visible rows, 1..N across parts. Badges: range, importance, type, release, total, Ep. Special, status; Optional rows dimmed; missing rows dashed. |
| Admin page `/watch-orders` | `frontend/src/pages/admin/WatchOrders.jsx` | Owner-first search over collections / franchises / series / orders; `?owner=tier:id` in the URL. "Show built-in" toggle (uses `auto=exclude` by default), "Backfill built-in orders" button, per-order Duplicate and Delete, create form with `LIST_TYPES`. |
| Editor | `frontend/src/components/tracker/WatchOrderEditor.jsx` | Entry picker from `/candidates` (client-side search over `search_names`, type filter, hide-added). Per-step from/to inputs (hidden for whole-only types), four importance buttons, note, slot number, arrows and drag-and-drop. Parts are boxes: add part ("Part N"), rename, remark, "Add entry to this part", move part. Every move commits the whole `item_ids` + `section_ids` sequence to `/reorder`; empty parts are re-anchored via PATCH `position` first. Built-in lists show an explanation instead of the picker. The anime-only kind has no UI button — it is created only by backfill or a direct `anime_only=true` call. |

## Sheets

Backup writes and Pull restores three tabs, registered in `app/services/pipelines/tabs.py` in restore order **Watch Order List → Watch Order Section → Watch Order Item** (after every media tab, since items cite entries). Columns are every model column, taken dynamically by `app/services/pipelines/backup.py` (`tab.model.__table__.columns`); parsers are `parse_watch_order_list_from_sheet`, `parse_watch_order_section_from_sheet`, `parse_watch_order_item_from_sheet` in `app/utils/formatter.py`.

| Tab | Restore behaviour (`app/services/pipelines/pull.py`) |
| --- | --- |
| Watch Order List | Owner ids are strict UUIDs (junk → None → single-owner check would fail). An id-less row is matched on `list_name` + `franchise_id` + `collection_id` and updated in place. |
| Watch Order Section | `list_id` strict UUID; an unparseable id becomes None. |
| Watch Order Item | `entry_id` unparseable → None (shows as a missing step); `section_id` unparseable → None (step restores unfiled); `importance` coerced via `normalize_importance` so a blank or pre-column cell restores as "Normal". Items have no natural key, so an id-less item row always inserts. |

Sheet-sync schemas (`WatchOrder*SheetSync`) live in `app/schemas/watch_order.py`.

## Krakoan reading orders

`scripts/seed_krakoan_reading_orders.py` builds two comic reading orders on the Marvel Comics franchise (hard-coded `FRANCHISE_ID`) from `UltimateKrakoanAXEReadingOrder.pdf`: "Ultimate Krakoan × A.X.E. Reading Order" (`list_type` Recommended, `is_most_recommended=True`) and "The Combined Core 精簡整合路線". Each plan is a list of `(section_name, section_remark, entries)`; entries resolve to `comic` rows by `(comic_name_en, release_year)` and carry issue ranges (`ep_start`/`ep_end` as issue numbers), importance and notes. It is idempotent (a same-named list on the franchise is deleted and rebuilt) and rolls back if any entry is unresolved, printing the missing keys. Title mismatches between the PDF and Comic Vine are catalogued in [`../notes/comicvine-link-conflicts.md`](../notes/comicvine-link-conflicts.md).

## Related

- `../data-model.md`, `docs/api.md`, `../frontend/pages.md`, `../business-rules.md` — older overviews; this file is the current reference for watch orders.
- `app/utils/release_date.py` — `RELEASE_PRIORITY`, `sort_key`, `display` used by built-in orders.
- `app/services/rbac/enforcement.py` — `apply_entry_visibility`, `drop_hidden_rows`.
- `app/utils/data_control_utils.py` — "Watch Order" branch of `log_deleted_record`.
- `tests/api/test_watch_order.py` — the behavioural spec (≈150 tests across lists, built-ins, series owners, opt-out, candidates, parts, contiguity, duplication).
