# API Reference

Last verified: 2026-09-04 (commit 5d1cecc)

**What this is for.** Every HTTP endpoint the app exposes, grouped by router, with its method, path, who may call it, the parameters and body it takes, and what it answers. Read it when wiring a frontend call, checking an error code, or verifying a route still exists. The tables were checked against the live route table (`venv/Scripts/python.exe -c "from app.main import app;[print(sorted(r.methods),r.path) for r in app.routes]"`); if a doc row and that dump disagree, the dump wins.

All endpoints are prefixed under `/api/`. The app is a SPA — all non-API routes are caught by a FastAPI catch-all that serves `index.html`.

## Authentication

- **Public endpoints** — accessible by any visitor (guest or admin).
- **Admin-only endpoints** — require a valid JWT in the `access_token` HTTP-Only cookie, enforced via `Depends(get_current_admin)` in `app/dependencies.py`.
- Login flow: `POST /api/auth/login` → sets cookie → all subsequent admin requests carry it automatically.
- A missing or invalid cookie on an admin endpoint is **401**, never 403. Public read endpoints additionally resolve a *viewer* and hide what the viewer's role may not see (as 404) — see [Authorization](#authorization) at the end of this file and `docs/authorization.md`.

## Conventions shared by many routers

| Convention | Where | Behaviour |
|---|---|---|
| `limit` / `offset` on list endpoints | collection, franchise, series, all eight media types, watch-order lists, quote, meme, options | `limit` defaults to 500, range 1–2000; `offset` defaults to 0. |
| `PATCH` with a raw JSON dict | collection, franchise, series, media entries, watch-order lists/items/sections, quote, meme | Handled by `apply_column_patch` (`app/routers/_patching.py`). Any of `system_id`, `id`, `created_at`, `updated_at` in the body → **422**. Keys that are not real columns of the row (relationship names, virtual fields such as `watch_next`, typos) are **silently ignored** and logged at debug level, so an older bundle sending an extra key does not break. |
| Post-write enrichment hooks | media entries (`POST` / `PUT`) | The per-type write hook (e.g. `execute_replace_single_movie`) runs after the row is committed. If it fails the error is logged and the row is still returned — it **no longer surfaces as a 500**, which used to make the SPA retry and create duplicates. |
| Delete returning `204` | notes, content labels, users, roles | No body. Every other delete returns a JSON `{status, message}` or the deleted row. |
| Hidden = missing | every public read | An entry the viewer may not see answers **404** with the router's normal not-found message. |

---

## Table of Contents

- [Auth — `/api/auth`](#auth--apiauth)
- [Collection — `/api/collection`](#collection--apicollection)
- [Franchise — `/api/franchise`](#franchise--apifranchise)
- [Series — `/api/series`](#series--apiseries)
- [Anime — `/api/anime`](#anime--apianime)
- [Anime Movie — `/api/anime-movie`](#anime-movie--apianime-movie)
- [Movie — `/api/movies`](#movie--apimovies)
- [TV Show — `/api/tv-shows`](#tv-show--apitv-shows)
- [Cartoon — `/api/cartoon`](#cartoon--apicartoon)
- [Manga — `/api/manga`](#manga--apimanga)
- [Novel — `/api/novel`](#novel--apinovel)
- [Comic — `/api/comic`](#comic--apicomic)
- [Watch Order — `/api/watch-order`](#watch-order--apiwatch-order)
- [Media Relation — `/api/media-relation`](#media-relation--apimedia-relation)
- [Plan Next — `/api/plan-next`](#plan-next--apiplan-next)
- [Quote — `/api/quote`](#quote--apiquote)
- [Meme — `/api/meme`](#meme--apimeme)
- [Note — `/api/notes`](#note--apinotes)
- [Seasonal — `/api/seasonal`](#seasonal--apiseasonal)
- [Search — `/api/search`](#search--apisearch)
- [Constants — `/api/constants`](#constants--apiconstants)
- [Options — `/api/options`](#options--apioptions)
- [Person — `/api/person`](#person--apiperson)
- [Studio — `/api/studio`](#studio--apistudio)
- [Credits — `/api/credits`](#credits--apicredits)
- [Announcements — `/api/announcements`](#announcements--apiannouncements)
- [Form Defaults — `/api/form-defaults`](#form-defaults--apiform-defaults)
- [Data Control — `/api/data-control`](#data-control--apidata-control)
- [System — `/api/system`](#system--apisystem)
- [Watch Order — Sections](#watch-order--sections)
- [Authorization](#authorization) — `/api/roles`, `/api/users`, `/api/content-labels`

---

## Auth — `/api/auth`

| Method | Path      | Auth   | Description                                                                                              |
| ------ | --------- | ------ | -------------------------------------------------------------------------------------------------------- |
| `POST` | `/login`  | Public | Authenticate with username + password (form data). Sets HTTP-Only JWT cookie. Returns `{message, role}`. |
| `GET`  | `/me`     | Public | Returns `{is_admin: bool, username}` from the current cookie. Used by `AuthContext` on app boot.         |
| `POST` | `/logout` | Public | Clears the `access_token` cookie.                                                                        |

**Login request:** `OAuth2PasswordRequestForm` — `username` and `password` fields.

---

## Collection — `/api/collection`

The optional umbrella tier above Franchise (e.g. Marvel, Type-Moon).

| Method   | Path           | Auth   | Description                                                                                                                                    |
| -------- | -------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET`    | `/`            | Public | List all collections. Optional query params: `search_query` (searches all five name fields), `limit` (≤2000), `offset`.                         |
| `GET`    | `/{system_id}` | Public | Get a single collection by UUID.                                                                                                               |
| `POST`   | `/`            | Admin  | Create a collection. Body: `CollectionCreate`.                                                                                                 |
| `PUT`    | `/{system_id}` | Admin  | Full update. Body: `CollectionUpdate`.                                                                                                         |
| `PATCH`  | `/{system_id}` | Admin  | Partial update (used by inline hub edits). Body: raw JSON dict.                                                                                |
| `DELETE` | `/{system_id}` | Admin  | Delete a collection. **Member franchises are NOT deleted** — their `collection_id` is set to `NULL` via the DB constraint. Logs to `deleted_record`. |

**Response model:** `CollectionResponse` (`created_at`/`updated_at` are optional, since a Pull can produce rows without them)

To list a collection's members, use `GET /api/franchise/?collection_id=<uuid>`.

---

## Franchise — `/api/franchise`

| Method   | Path           | Auth   | Description                                                                                                                                                                   |
| -------- | -------------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET`    | `/`            | Public | List all franchises. Optional query params: `collection_id` (UUID — filters to one collection's members), `search_query` (searches across all name fields), `limit`, `offset`. |
| `GET`    | `/{system_id}` | Public | Get a single franchise by UUID.                                                                                                                                               |
| `POST`   | `/`            | Admin  | Create a franchise. Body: `FranchiseCreate`.                                                                                                                                  |
| `PUT`    | `/{system_id}` | Admin  | Full update of a franchise. Body: `FranchiseUpdate`.                                                                                                                          |
| `PATCH`  | `/{system_id}` | Admin  | Partial update (e.g. inline rating edit). Body: raw JSON dict.                                                                                                                |
| `DELETE` | `/{system_id}` | Admin  | Delete a franchise. Linked series, anime, movies, TV shows, cartoons, manga, and novels `franchise_id` are set to `NULL` via DB constraint cascade. Logs to `deleted_record`. |

**Response model:** `FranchiseResponse`

---

## Series — `/api/series`

| Method   | Path           | Auth   | Description                                                                        |
| -------- | -------------- | ------ | ---------------------------------------------------------------------------------- |
| `GET`    | `/`            | Public | List all series. Optional params: `franchise_id` (UUID), `search_query`.           |
| `GET`    | `/{system_id}` | Public | Get a single series by UUID.                                                       |
| `POST`   | `/`            | Admin  | Create a series. Resolves or auto-creates parent franchise. Body: `SeriesCreate`.  |
| `PUT`    | `/{system_id}` | Admin  | Full update. Resolves hierarchy changes. Body: `SeriesUpdate`.                     |
| `PATCH`  | `/{system_id}` | Admin  | Partial update (e.g. inline rating edit). Body: raw JSON dict.                     |
| `DELETE` | `/{system_id}` | Admin  | Delete a series. Linked `anime.series_id` set to `NULL`. Logs to `deleted_record`. |

**`SeriesCreate` / `SeriesUpdate` body (= `SeriesBase`):** `franchise_id`, `series_name_en`, `series_name_cn`, `series_name_roman`, `series_name_jp`, `series_name_alt`, `my_rating`, `series_expectation` (default `"Low"`), `cover_entry_id`, `remark`. No `to_rewatch` field — `series` has no rewatch column or virtual field at all; a series' rewatch marks are read and written through `POST` / `DELETE /api/plan-next/target` with `scope=series` directly (see Plan Next below).

**Response model:** `SeriesResponse` — `SeriesCreate`/`SeriesUpdate` fields above plus `system_id`, `created_at`, `updated_at`.

---

> **Media entry routers.** All eight media types — `anime`, `anime-movie`, `movies`, `tv-shows`, `cartoon`, `manga`, `novel`, `comic` — are generated by `make_media_router` from their `MEDIA_REGISTRY` spec (`app/routers/_factory.py`, `app/registry.py`); `anime.py` and `anime_movie.py` are now two-line files. Every type uses `/{entry_id}` for single-entry paths and exposes the same shape: list (`limit`/`offset`, `search_query`, plus the type's `list_filters`), get, `POST`, `PUT`, `PATCH`, `POST /{entry_id}/complete`, `DELETE`. Comic adds `/search-comicvine`. Lists are ordered `created_at` descending. Every list and detail response carries the plan flags and the link fields (credits/tags) — see Credits below.

## Anime — `/api/anime`

| Method   | Path           | Auth   | Description                                                                                                    |
| -------- | -------------- | ------ | -------------------------------------------------------------------------------------------------------------- |
| `GET`    | `/`            | Public | List anime. Optional params: `franchise_id`, `series_id`, `search_query`, `airing_season` (e.g. `"WIN 2026"`), `limit`, `offset`. |
| `GET`    | `/{entry_id}` | Public | Get a single anime entry by UUID.                                                                              |
| `POST`   | `/`            | Admin  | Create an anime entry. Runs episode math and domain rules. Body: `AnimeCreate`.                                |
| `PUT`    | `/{entry_id}` | Admin  | Full update. Runs episode math and domain rules. Body: `AnimeUpdate`.                                          |
| `PATCH`  | `/{entry_id}` | Admin  | Partial update (e.g. +1 episode). Body: raw JSON dict — see the shared PATCH semantics above.    |
| `POST`   | `/{entry_id}/complete` | Admin  | Sets completion fields (watching status to "Completed", episodes finished, timestamps).             |
| `DELETE` | `/{entry_id}` | Admin  | Delete an anime entry. Cleans up local cover image. Logs to `deleted_record`.                                  |

**Response model:** `AnimeResponse` (includes computed fields `cum_ep_fin`, `cum_ep_total`)

---

## Anime Movie — `/api/anime-movie`

| Method   | Path           | Auth   | Description                                                                                |
| -------- | -------------- | ------ | ------------------------------------------------------------------------------------------ |
| `GET`    | `/`            | Public | List all anime movies. Optional params: `franchise_id`, `watching_status`, `search_query`, `limit`, `offset`. |
| `GET`    | `/{entry_id}` | Public | Get a single anime movie entry by UUID.                                                    |
| `POST`   | `/`            | Admin  | Create an anime movie entry. Body: `AnimeMovieCreate`.                                     |
| `PUT`    | `/{entry_id}` | Admin  | Full update. Body: `AnimeMovieUpdate`.                                                     |
| `PATCH`  | `/{entry_id}` | Admin  | Partial update (e.g. watching status, rating). Body: raw JSON dict.                        |
| `POST`   | `/{entry_id}/complete` | Admin  | Sets completion fields (watching status to "Completed", timestamps).                    |
| `DELETE` | `/{entry_id}` | Admin  | Delete an anime movie entry. Cleans up local cover image. Logs to `deleted_record`.        |

**Response model:** `AnimeMovieResponse`

---

## Movie — `/api/movies`

| Method   | Path                   | Auth   | Description                                                                                                             |
| -------- | ---------------------- | ------ | ----------------------------------------------------------------------------------------------------------------------- |
| `GET`    | `/`                    | Public | List all movie entries. Optional params: `franchise_id`, `series_id`, `watching_status`, `airing_status`, `movie_type`. |
| `GET`    | `/{entry_id}`          | Public | Get a single movie entry by UUID.                                                                                       |
| `POST`   | `/`                    | Admin  | Create a movie entry. Auto-runs `execute_replace_single_movie` after creation. Body: `MovieCreate`.                     |
| `PUT`    | `/{entry_id}`          | Admin  | Full update of a movie entry. Auto-runs `execute_replace_single_movie` after update. Body: `MovieUpdate`.               |
| `PATCH`  | `/{entry_id}`          | Admin  | Partial update (e.g. watching status, rating). Does not re-run pipeline. Body: raw JSON dict.                           |
| `DELETE` | `/{entry_id}`          | Admin  | Delete a movie entry. Removes cover image from GCS if present. Logs to `deleted_record`.                                |
| `POST`   | `/{entry_id}/complete` | Admin  | Sets completion fields (watching status to "Completed", timestamps).                                                    |

**Response model:** `MovieResponse`

**IMDb pipeline:** `POST /` and `PUT /{entry_id}` both automatically trigger `execute_replace_single_movie`, which extracts the IMDb ID from `imdb_link`, calls TMDB and OMDb, and fills missing fields (length, director, release dates, imdb_rating, cover image).

---

## TV Show — `/api/tv-shows`

| Method   | Path                    | Auth   | Description                                                                                                                    |
| -------- | ----------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------ |
| `GET`    | `/`                     | Public | List all TV shows. Optional params: `franchise_id`, `series_id`, `watching_status`, `airing_status`, `region`, `search_query`. |
| `GET`    | `/{entry_id}`         | Public | Get a single TV show entry by UUID.                                                                                            |
| `POST`   | `/`                     | Admin  | Create a TV show entry. Auto-runs `execute_replace_single_tv_show` after creation. Body: `TVShowCreate`.                       |
| `PUT`    | `/{entry_id}`         | Admin  | Full update of a TV show entry. Auto-runs `execute_replace_single_tv_show` after update. Body: `TVShowUpdate`.                 |
| `PATCH`  | `/{entry_id}`         | Admin  | Partial update (e.g. inline ratings). Does not re-run pipeline. Body: raw JSON dict.                                           |
| `POST`   | `/{entry_id}/complete` | Admin  | Sets completion fields (watching status to "Completed", episodes finished, timestamps).                                        |
| `DELETE` | `/{entry_id}`         | Admin  | Delete a TV show entry. Removes cover from local/GCS storage. Logs to `deleted_record`.                                        |

**Response model:** `TVShowResponse`

---

## Cartoon — `/api/cartoon`

| Method   | Path                    | Auth   | Description                                                                                                                        |
| -------- | ----------------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| `GET`    | `/`                     | Public | List all cartoons. Optional params: `franchise_id`, `series_id`, `watching_status`, `airing_status`, `search_query`. No `to_rewatch` filter — cartoon has no rewatch field at all (see Plan Next below); passing it is silently ignored like any unknown filter. |
| `GET`    | `/{entry_id}`         | Public | Get a single cartoon entry by UUID.                                                                                                |
| `POST`   | `/`                     | Admin  | Create a cartoon entry. Auto-runs `execute_replace_single_cartoon` after creation. Body: `CartoonCreate`.                          |
| `PUT`    | `/{entry_id}`         | Admin  | Full update of a cartoon entry. Auto-runs `execute_replace_single_cartoon` after update. Body: `CartoonUpdate`.                    |
| `PATCH`  | `/{entry_id}`         | Admin  | Partial update. Does not re-run pipeline. Body: raw JSON dict.                                                                     |
| `POST`   | `/{entry_id}/complete` | Admin  | Sets completion fields (watching status to "Completed", episodes finished, timestamps).                                            |
| `DELETE` | `/{entry_id}`         | Admin  | Delete a cartoon entry. Removes cover from local/GCS storage. Logs to `deleted_record`.                                            |

**Response model:** `CartoonResponse`

---

## Manga — `/api/manga`

| Method   | Path                   | Auth   | Description                                                                                                                          |
| -------- | ---------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| `GET`    | `/`                    | Public | List all manga. Optional params: `franchise_id`, `series_id`, `reading_status`, `serialization_status`, `search_query`. No `to_reread` filter — dropped along with the column; passing it is silently ignored like any unknown filter. |
| `GET`    | `/{entry_id}`          | Public | Get a single manga entry by UUID.                                                                                                    |
| `POST`   | `/`                    | Admin  | Create a manga entry. Auto-runs `execute_replace_single_manga` after creation. Body: `MangaCreate`.                                  |
| `PUT`    | `/{entry_id}`          | Admin  | Full update of a manga entry. Auto-runs `execute_replace_single_manga` after update. Body: `MangaUpdate`.                            |
| `PATCH`  | `/{entry_id}`          | Admin  | Partial update. Does not re-run pipeline. Body: raw JSON dict.                                                                       |
| `POST`   | `/{entry_id}/complete` | Admin  | Sets completion fields (reading status to "Completed", volumes/chapters finished, serialization status).                             |
| `DELETE` | `/{entry_id}`          | Admin  | Delete a manga entry. Removes cover from local/GCS storage. Logs to `deleted_record`.                                                |

**Response model:** `MangaResponse`

---

## Novel — `/api/novel`

| Method   | Path                   | Auth   | Description                                                                                                                           |
| -------- | ---------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| `GET`    | `/`                    | Public | List all novels. Optional params: `franchise_id`, `series_id`, `reading_status`, `serialization_status`, `search_query`. No `to_reread` filter — dropped along with the column; passing it is silently ignored like any unknown filter. |
| `GET`    | `/{entry_id}`          | Public | Get a single novel entry by UUID.                                                                                                     |
| `POST`   | `/`                    | Admin  | Create a novel entry. Auto-runs `execute_replace_single_novel` after creation. Body: `NovelCreate`.                                   |
| `PUT`    | `/{entry_id}`          | Admin  | Full update of a novel entry. Auto-runs `execute_replace_single_novel` after update. Body: `NovelUpdate`.                             |
| `PATCH`  | `/{entry_id}`          | Admin  | Partial update. Does not re-run pipeline. Body: raw JSON dict.                                                                        |
| `POST`   | `/{entry_id}/complete` | Admin  | Sets completion fields (reading status to "Completed", volumes finished, serialization status).                                       |
| `DELETE` | `/{entry_id}`          | Admin  | Delete a novel entry. Removes cover from local/GCS storage. Logs to `deleted_record`.                                                 |

**Response model:** `NovelResponse`

---

## Comic — `/api/comic`

Western comic runs. Enriched from Comic Vine by volume ID — see the Comic
Fill/Replace notes under Data Control below.

| Method   | Path                   | Auth   | Description                                                                                                                           |
| -------- | ---------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| `GET`    | `/`                    | Public | List all comics. Optional params: `franchise_id`, `series_id`, `reading_status`, `serialization_status`, `search_query`. No `to_reread` filter — dropped along with the column; passing it is silently ignored like any unknown filter. |
| `GET`    | `/{entry_id}`          | Public | Get a single comic entry by UUID.                                                                                                     |
| `POST`   | `/`                    | Admin  | Create a comic entry. Auto-runs `execute_replace_single_comic` after creation — no external metadata fetch, but it re-extracts system options and logs the write (see Data Control). Body: `ComicCreate`. |
| `PUT`    | `/{entry_id}`          | Admin  | Full update of a comic entry. Auto-runs `execute_replace_single_comic` after update — same no-fetch/re-extract/log behavior. Body: `ComicUpdate`.        |
| `PATCH`  | `/{entry_id}`          | Admin  | Partial update. Does not re-run pipeline. Body: raw JSON dict.                                                                        |
| `POST`   | `/{entry_id}/complete` | Admin  | Sets completion fields (reading status to "Completed", serialization status to `完結`, issues finished/total snapped to the higher of the two). |
| `DELETE` | `/{entry_id}`          | Admin  | Delete a comic entry. Removes cover from local/GCS storage. Logs to `deleted_record`.                                                 |
| `GET`    | `/search-comicvine`   | Admin  | Search Comic Vine volumes by name so the right run can be identified. Params: `q` (required), `limit` (1-50, default 10). Returns `comicvine_id`, `name`, `start_year`, `publisher`, `issue_total`, `comicvine_link`, `cover_image_url`. |

**Response model:** `ComicResponse`

---

## Watch Order — `/api/watch-order`

Named, ordered, cross-media-type viewing guides owned by a franchise or a
collection. Reads are public; every write is admin-only. These replaced the
per-entry `watch_order` Float column, which has been dropped.

| Method   | Path                          | Auth   | Description                                                                                                                                        |
| -------- | ----------------------------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET`    | `/lists`                      | Public | List order summaries (no items). Optional params: `franchise_id`, `collection_id`, `series_id` (owner filters), `search_query`, `auto` (`exclude` hides generated lists, `only` shows just them), `limit` (≤2000), `offset`. Sorted most-recommended, then default, then `sort_index`, then name. |
| `GET`    | `/lists/{system_id}`          | Public | One order with its items **resolved** to display data.                                                                                             |
| `GET`    | `/candidates`                 | Public | Every entry an order for this owner may include, flattened across the eight media tables, in the resolver's shape (`display_name`, `cover_image_file`, `franchise_id`, `status`, `total_episodes`, `ep_special`). Exactly one of `franchise_id` / `collection_id` required. |
| `POST`   | `/lists`                      | Admin  | Create an order. Body: `WatchOrderListCreate`. 400 unless exactly one owner is given.                                                               |
| `POST`   | `/lists/release`              | Admin  | Give one owner a built-in order (`franchise_id`, `collection_id` or `series_id`; `anime_only=true` for the anime variant). Idempotent per kind. 400 below 2 entries in scope, or for a collection that opts out. |
| `POST`   | `/lists/release/backfill`     | Admin  | Give every franchise, series and collection its built-in orders, skipping owners that already have them, those below 2 entries, and opted-out collections. Safe to re-run; returns `created`, `skipped_too_small` and `skipped_opted_out`. |
| `PUT`    | `/lists/{system_id}`          | Admin  | Full update. Body: `WatchOrderListUpdate`.                                                                                                         |
| `PATCH`  | `/lists/{system_id}`          | Admin  | Partial update (inline edits). Body: raw JSON dict.                                                                                                |
| `DELETE` | `/lists/{system_id}`          | Admin  | Delete an order. Items cascade; the media entries are untouched. Logs to `deleted_record` as type "Watch Order".                                    |
| `POST`   | `/lists/{system_id}/duplicate` | Admin | Copy an order and its steps into a new, editable list named `"<name> (Copy)"`. Keeps the owner, type, note and `sort_index`; clears `is_default` and `is_most_recommended`; always sets `auto_source` to null. A built-in source has its generated steps written out as real rows. 404 on an unknown id. |
| `POST`   | `/lists/{system_id}/items`    | Admin  | Add a step. Appends unless `position` is given. Body: `WatchOrderItemCreate`. 400 on an unknown media type or a nonexistent entry.                  |
| `PUT`    | `/items/{item_id}`            | Admin  | Full update of one step. Body: `WatchOrderItemUpdate`.                                                                                             |
| `PATCH`  | `/items/{item_id}`            | Admin  | Partial update (episode range, optional flag, note). Body: raw JSON dict.                                                                          |
| `DELETE` | `/items/{item_id}`            | Admin  | Remove one step.                                                                                                                                   |
| `PUT`    | `/lists/{system_id}/reorder`  | Admin  | Renumber positions to 1..N, and optionally re-file each step into a part. Body: `WatchOrderReorder` (`item_ids`, optional `section_ids`). 400 unless the payload names every item of the list exactly once, or if the order would split a part. |

`WatchOrderReorder.section_ids` is optional and runs parallel to `item_ids` —
one entry per step, `null` for unfiled. Order and part travel in one request
because a drag changes both at once; committing them separately would leave the
guide reordered but still filed under the part the step was dragged out of.
Omitting it leaves every step filed where it already is. An order that would
split a part is rejected with 400 and nothing is written.

**Built-in orders.** A list with `auto_source = "release"` has no
`watch_order_item` rows: `GET /lists/{id}` computes its steps from the entries'
release dates each time, so entries added later appear on their own. Every item
endpoint (add, update, delete, reorder) returns 400 for such a list, while the
list's own name, type, note and flags stay editable. The one exception is
`POST /lists/{id}/duplicate`, which is how a built-in becomes editable: it
materializes the generated steps into a hand-built copy. `GET /lists` accepts
`auto=exclude` / `auto=only`, since built-in lists would otherwise bury the
hand-built ones in any cross-owner view, and `series_id` as an owner filter.

Ordering reads the columns named in `release_date.RELEASE_PRIORITY` — JP then
TW for anime movies, TW then USA for movies, and `release_date` for everything
else. A date missing precision resolves to the **first of that period**: a bare
year is 1 January, a month and year the 1st of that month, so a year-only manga
ties with a 1 January release rather than sorting just ahead of it, and the two
are separated by name. Entries with no parseable date at all sink to the bottom.

There are two built-in kinds: `release` (cross-type) and `release-anime`
(anime only). Both are available to a franchise or a series; a collection gets
the cross-type one only. A series-owned order cannot contain anime movies —
`anime_movies` has no `series_id` column.

A built-in order is refused when the scope holds fewer than **2** entries — a
franchise that is a single movie, TV series or novel has nothing to order —
and when the franchise belongs to a collection with `no_built_in_orders` set
(迪士尼, whose members are unrelated standalone works).

**Single-winner flags.** `is_default` (opens first) and `is_most_recommended`
(the one to follow) are independent, and each is limited to one list per owner:
setting either on create, `PUT`, or `PATCH` clears it on the owner's other
lists. Listing sorts most-recommended first, then default, then `sort_index`,
then name.

**Derived scope.** Every list response carries `media_types` — the distinct
media types among its steps, in a fixed canonical order (anime, anime-movie,
movie, tv-show, cartoon, manga, novel, comic). One entry means a single-type order,
several mean a cross-type one, and an empty list has none yet. It is computed
from the items rather than stored, so it cannot drift from them; the listing
endpoint gets it and `item_count` for every row in one grouped query.

**Response models:** `WatchOrderListResponse` (adds computed `item_count` and `media_types`),
`WatchOrderListDetailResponse` (adds `items`), `WatchOrderItemResponse`,
`WatchOrderCandidate`.

**Item resolution.** `watch_order_item` stores only `(media_type, entry_id)` —
no foreign key spans eight tables — so the detail endpoint enriches each item
with `display_name`, `cover_image_file`, `franchise_id`, `status`,
`total_episodes` and `ep_special` via `app/services/domain/watch_order.py`. That runs one query
per media type present, never one per item. An item whose entry no longer
exists comes back with `missing: true` rather than being dropped.

---

## Media Relation — `/api/media-relation`

Typed links between two media entries. Reads are public; every write is
admin-only, matching watch orders. Replaces the per-entry `prequel_id` /
`sequel_id` / `alternative` columns.

| Method   | Path                                     | Auth   | Description                                                                                                               |
| -------- | ---------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------- |
| `GET`    | `/kinds`                                 | Public | The relation vocabulary: `key`, `label`, `inverse_label`, `family` (`timeline`, `equivalence`, `branch`, `derivation`), `symmetric`, `stored_as`. Eleven entries — the ten stored kinds (`sequel`, `alternative`, `corresponding`, `renew`, `directors_cut`, `extended`, `side_story`, `spin_off`, `setting`, `adaptation`) plus `prequel`, which is stored as a swapped `sequel`. |
| `GET`    | `/for-entry?media_type=&entry_id=`       | Public | Every relation touching one entry, from **both** endpoints, each resolved to the far entry's display data and labelled for the side being viewed. |
| `GET`    | `/?franchise_id=` or `?collection_id=`   | Public | Every relation with at least one endpoint among a scope's entries. Backs the admin page's count badges in one request. Exactly one scope param, else 400. |
| `GET`    | `/graph?franchise_id=`, `?collection_id=` or `?series_id=` | Public | Everything the `/relations` canvas draws for one scope, in one request: `{nodes, edges}`. Exactly one scope param, else 400. A series scope resolves against `series_id` directly (an anime movie has no `series_id`, so it can only appear as a ghost). **Viewer-filtered**: nodes and edges touching an entry the viewer may not see are dropped. |
| `POST`   | `/`                                      | Admin  | Create. Body is the relation as typed; direction is normalized before writing.                                             |
| `PATCH`  | `/{system_id}`                           | Admin  | Edit `kind`, `swap` and/or `remark`. Changing the kind re-normalizes, so Sequel → Prequel flips the stored endpoints; `swap: true` trades the endpoints over keeping the kind, which is the only way to turn an Adaptation or a Spin-off around. Swapping a symmetric kind is a no-op, and one that would duplicate an existing row is a 409. |
| `DELETE` | `/{system_id}`                           | Admin  | Delete. Logs to `deleted_record` as type "Media Relation". The two entries are untouched.                                  |
| `DELETE` | `/scope?franchise_id=`, `?collection_id=` or `?series_id=` | Admin  | Reset: every relation the `/graph` endpoint would draw for that scope, deleted in one transaction. Returns `{status, deleted, message}`. Rows with only one endpoint in scope (the canvas's ghost links) go too. Each is logged to `deleted_record`, which is the only way back — the page offers no undo for it. Exactly one scope param, else 400. Declared above `/{system_id}` so the path is not read as a relation id. |

**Create body**

```json
{
  "from_type": "anime", "from_id": "…",
  "kind": "prequel",
  "to_type": "anime-movie", "to_id": "…",
  "remark": null
}
```

`kind` accepts any of the eleven user-facing keys. `prequel` is stored as a
`sequel` row with the endpoints swapped; a symmetric `alternative` has its two
`(type, id)` pairs sorted. Both rewrites exist so one fact is one row.

**Errors**

- `400` — unknown `kind`, unknown media type, or an endpoint that does not exist.
- `409` — self-relation, or a duplicate. The duplicate message names the
  existing row's id and notes it may have been entered from the other side.
  Both mirror table constraints so neither surfaces as a 500.

**Reading direction.** A row reads `from` → `to` ("`from` is the *label* of
`to`"). `/for-entry` labels the entry at the **far** end, so viewing `from`
returns the kind's `inverse_label` and viewing `to` returns its `label`: if A is
the Sequel of B, A's page shows B as "Prequel" and B's shows A as "Sequel".
`direction` is `"forward"` when the viewed entry is `from`.

A far endpoint whose row no longer exists comes back with `missing: true` rather
than being dropped, since endpoints are FK-less.

**Transitive kinds.** `/for-entry` also returns rows no `media_relation` row
names directly. `alternative` and `corresponding` are transitive, so with
`A-corresponding-B` and `B-corresponding-C` stored, A's response includes C.
Those inferred rows carry `derived: true`, a null `system_id`, no `remark`, no
timestamps, and a `via` naming the neighbour the chain arrived through. They
sort after the stored rows. Chains cross kinds and resolve to their weakest
link, so `A-alternative-B` with `B-corresponding-C` gives A a `corresponding`
row for C; where several routes reach an entry, the strongest one any of them
supports wins. `/graph` is unaffected — it returns stored rows only, which is
what keeps the canvas from drawing a mesh.

**Graph response.** `nodes` covers every entry in the scope, including ones
with no relations, plus a "ghost" node for each relation endpoint outside the
scope (`in_scope: false`); a ghost whose row no longer exists also carries
`missing: true`. Each node is keyed `"{media_type}:{entry_id}"`. `edges` mirror
the stored `media_relation` rows, with `from`/`to` as the same node keys and
both `label` and `inverse_label` carried along so the canvas can label an edge
from either end without a second copy of the kind vocabulary.

---

## Plan Next — `/api/plan-next`

What is queued to watch or read (kind `next`), or marked for rewatch/reread
(kind `rewatch`), at entry, series, or franchise scope. **One table backs
both Plan-page queues** — the `plan_next` name predates the second one; see
data-model.md. Reads are public (planning state is ordinary catalogue
data); every write is admin-only, matching media relations and watch orders.
Replaces the `watch_next` / `read_next` booleans, `franchise.watch_next_group`,
and the nine `to_rewatch` / `to_reread` booleans — see data-model.md and
business-rules.md.

| Method   | Path                                          | Auth   | Description                                                                                                     |
| -------- | ---------------------------------------------- | ------ | ----------------------------------------------------------------------------------------------------------------- |
| `GET`    | `/kinds`                                       | Public | The vocabulary the admin dropdowns and the Plan page tabs read from: `scopes`, `kinds` (`["next", "rewatch"]`), `allowed_scopes` (keyed by kind, then media type, scopes ordered entry/series/franchise), `size_groups` (per media type, `{key, label}` list). |
| `GET`    | `/?media_type=&scope=&kind=`                   | Public | Every row, each resolved to its target's display data. All three filters optional; omitting `kind` returns both kinds in one call, so the Plan page still loads its whole dataset in one request. |
| `POST`   | `/`                                            | Admin  | Create one row. Body includes `kind`, defaulting to `"next"` when omitted so every pre-rewatch caller keeps working. `422` for an unknown kind, `400` if the media type may not be planned at that scope for that kind, `404` if the target does not exist, `409` if the `(kind, scope, target_id, media_type)` quadruple already exists. |
| `DELETE` | `/target?scope=&media_type=&target_id=&kind=`  | Admin  | Un-plan by target rather than by row id, so a toggle needs no id round-trip first. Query params only. `kind` defaults to `"next"` when omitted. `404` if not planned. |
| `DELETE` | `/{system_id}`                                 | Admin  | Delete by row id. Logs to `deleted_record` as type "Plan Next".                                                    |

**Create body**

```json
{
  "media_type": "anime",
  "scope": "series",
  "target_id": "…",
  "remark": null,
  "kind": "next"
}
```

**Read response** — each row resolves its target through the same
`OWNER_TABLES` map `media_relation` and `watch_order_item` use:

```json
{
  "system_id": "…", "media_type": "anime", "scope": "series", "target_id": "…",
  "remark": null, "kind": "next", "created_at": "…", "updated_at": "…",
  "missing": false, "display_name": "…", "label": "…", "is_tier": true,
  "cover_image_file": null, "nav_path": "/series", "expectation": "High"
}
```

A deleted target resolves as `missing: true` rather than the row vanishing,
since the target carries no foreign key. `expectation` is read off whichever
of `franchise_expectation` / `series_expectation` / `expectation` the target
actually has, so the Plan page can sort every scope by the same field.

**Entry-level `watch_next` / `read_next` / `to_rewatch` / `to_reread` are not
endpoints of their own.** They ride along on the existing entry endpoints
(`/api/anime`, `/api/manga`, etc.) as virtual fields backed by `plan_next`
rows (`kind='next'` / `kind='rewatch'` respectively) — see business-rules.md.
Six of the nine dropped `to_rewatch` / `to_reread` columns survive this way:
anime-movie, movie, tv-show (`to_rewatch`); manga, novel, comic (`to_reread`).
`anime` and `cartoon` have **no** entry-level rewatch field — both are
rewatched at franchise scope only, targeted directly through this router with
`scope=franchise`, `kind=rewatch`. `franchise` and `series` have no rewatch
field of any kind; their marks go through this router with `scope=franchise`
/ `scope=series` and `kind=rewatch` directly, never through an entry-style
boolean on `POST /api/franchise` / `POST /api/series`.

---

## Quote — `/api/quote`

Memorable lines and memes attached to a media entry. Reads are public; every
write is admin-only.

| Method   | Path            | Auth   | Description                                                                                                                                                                                    |
| -------- | --------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET`    | `/`             | Public | List quotes. Optional params: `media_type`, `entry_id`, `is_general`, `is_favorite`, `needs_review`, `tag`, `search_query`, `limit` (≤2000), `offset`. Newest first.                     |
| `GET`    | `/grouped`      | Public | The Quote page feed: quotes bucketed by entry, each bucket carrying its resolved entry header. Same filters minus `entry_id`. Named entries sort first; unresolvable ones sink to the bottom.    |
| `GET`    | `/{quote_id}`   | Public | One quote with its entry's display data.                                                                                                                                                        |
| `POST`   | `/`             | Admin  | Create. Body: `QuoteCreate`. 400 on an unknown `media_type`.                                                                                                                                    |
| `PUT`    | `/{quote_id}`   | Admin  | Full update. Body: `QuoteUpdate`.                                                                                                                                                               |
| `PATCH`  | `/{quote_id}`   | Admin  | Partial update (inline edits, favorite toggle). Body: raw JSON dict.                                                                                                                            |
| `DELETE` | `/{quote_id}`   | Admin  | Delete. Logs to `deleted_record` as type "Quote". `image_file` is left alone — quote images are hand-managed local files.                                                                        |

**Response models:** `QuoteResponse`, `QuoteResolved` (adds `missing`,
`entry_display_name`, `cover_image_file`, `franchise_id`, `entry_nav_path`, and
a derived `meme_id` when the quote is also a line of a meme),
`QuoteGroup` (an entry header plus its `quotes`).

**Entry resolution.** `quote` stores only `(media_type, entry_id)` — no foreign
key spans eight tables — so every read enriches rows through
`app/utils/media_resolver.py`. That issues one query per media type present,
never one per quote. A quote whose entry no longer exists comes back with
`missing: true` rather than being dropped, so the dangling row stays fixable.

`search_query` searches `text`, `translation`, `speaker`, and `original_source`.
`tag` uses JSONB containment against the `tags` list.

---

## Meme — `/api/meme`

Jokes, catchphrases and running gags attached to a media entry. A sibling of
Quote with its own shape: one text, one image, or one of each.
Reads are public; every write is admin-only.

| Method   | Path           | Auth   | Description                                                                                                                                       |
| -------- | -------------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET`    | `/`            | Public | List memes. Optional params: `owner_type`, `owner_id`, `is_favorite`, `search_query` (matches `text`), `limit` (≤2000), `offset`.                   |
| `GET`    | `/grouped`     | Public | The Meme page feed: memes bucketed by owner, each bucket carrying its resolved owner header. Named owners sort first; unresolvable ones last.       |
| `GET`    | `/{meme_id}`   | Public | One meme with its entry and linked-quote data resolved.                                                                                            |
| `POST`   | `/`            | Admin  | Create. Body: `MemeCreate`. 400 on an unknown `owner_type`, an unknown `quote_id`, or a quote already claimed by another meme.                      |
| `PUT`    | `/{meme_id}`   | Admin  | Full update, same validation.                                                                                                                      |
| `PATCH`  | `/{meme_id}`   | Admin  | Partial update. Body: raw JSON dict.                                                                                                               |
| `DELETE` | `/{meme_id}`   | Admin  | Delete. Logs to `deleted_record` as type "Meme". **Linked quotes are not deleted** — a quote stands on its own.                                     |

**Response models:** `MemeResponse`, `MemeResolved` (adds the resolved owner
fields — `owner_display_name`, `owner_label`, `owner_is_tier`, `owner_nav_path`
— plus `quote_speaker` / `quote_translation` when the text is also a quote),
`MemeGroup` (an owner header plus its `memes`).

**Resolution.** `meme` stores only `(owner_type, owner_id)`, resolved through
`app/utils/media_resolver.py` against **`OWNER_TABLES`** — the eight media
tables plus Series, Franchise and Collection — one query per table present.
Quote and watch-order pass the narrower default map, so they keep rejecting a
tier. `quote_id` is hydrated in a single batched query for the whole response,
so the page can show whose line it is without fetching per meme.

Because `quote_id` is a real FK with `ON DELETE SET NULL` and `UNIQUE`, there is
no dangling-quote state to represent: deleting a quote simply unlinks it.

Quotes are entry-only, so a tier-owned meme has no quotes of its own to link;
the frontend hides the quote-link control in that case.

---

## Note — `/api/notes`

Structured commentary on any owner: one row per bullet, linked resource or
episode comment. Replaces the `notes` JSONB column that used to sit on the
seven media tables. Reads are public; every write is admin-only.

Like Meme, a note's owner may be a media entry **or** one of the three
grouping tiers — the same eleven hyphenated `owner_type` values.

| Method   | Path           | Auth   | Description                                                                                                                                       |
| -------- | -------------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET`    | `/sections`    | Public | The section registry resolved for one owner type, in display order. Required param: `owner_type`. 400 on an unknown one.                            |
| `GET`    | `""`           | Public | Every note for one owner, ordered the way the page renders them. Required params: `owner_type`, `owner_id`.                                        |
| `POST`   | `""`           | Admin  | Create (201). Body: `NoteCreate`. 422 on a payload the registry rejects, or on a second row in a singleton section. `sort_index` defaults to the end.     |
| `PATCH`  | `/reorder`     | Admin  | Rewrite `sort_index` for one section of one owner. Body: `NoteReorder`. 400 unless `ordered_ids` names exactly that section's notes.                |
| `PATCH`  | `/{note_id}`   | Admin  | Partial update. Body: `NoteUpdate`, validated as the row *will* be, so a partial update cannot land on an invalid combination.                      |
| `DELETE` | `/{note_id}`   | Admin  | Delete, **204 No Content**. Logs to `deleted_record` as type "Note", standing a truncated `content` in for the name a note does not have.        |

**Response models:** `NoteResponse`, `NoteSectionOut` (one resolved registry
entry: `key`, `shape`, `label`, `kinds`, `locator_placeholder`,
`locator_required`, `singleton`, `desc_required`).

**The registry is the contract.** `app/utils/note_sections.py` is the single
authority on what a section is; `/sections` is how the frontend learns it, so
the page names no section keys of its own. `label`, `kinds`,
`locator_placeholder` and `desc_required` arrive already resolved for the
requested owner — on `highlight_episodes`, manga reads "神回", "Chapter(s), e.g.
ch 6" and an empty `kinds`, where TV and cartoon read the defaults plus the
神回/神片段/神篇章 dropdown — so the client needs no per-owner branching.

**Ordering.** A listing sorts by the section's position in the registry first,
then `sort_index` within it, which is exactly the page's render order.

`/reorder` is declared **before** `/{note_id}`: FastAPI matches in declaration
order, so the dynamic route would otherwise swallow `reorder` as a note id. It
has no frontend caller yet — it is intentional surface awaiting a reorder UI.

---

## Seasonal — `/api/seasonal`

| Method  | Path              | Auth   | Description                                                                                         |
| ------- | ----------------- | ------ | --------------------------------------------------------------------------------------------------- |
| `GET`   | `/current-season` | Public | Returns `{current_season}` from `system_configs`. Used by frontend to highlight the current season. |
| `GET`   | `/`               | Public | List all seasonal records, ordered by `seasonal` descending.                                        |
| `GET`   | `/{seasonal_id}`  | Public | Get a single seasonal record by its string key (e.g. `"WIN 2026"`).                                 |
| `PATCH` | `/{seasonal_id}`  | Admin  | Update `my_rating` for a seasonal record. Body: `SeasonalUpdate`.                                   |

**Response model:** `SeasonalResponse`

---

## Search — `/api/search`

Cross-type search. One request covers every named table, so the nav dropdown and
the `/search` page each make a single call instead of fanning out over twelve
list endpoints.

| Method | Path | Auth   | Description                                     |
| ------ | ---- | ------ | ----------------------------------------------- |
| `GET`  | `/`  | Public | Every entry, group, and season matching a query. |

**Query parameters**

| Name    | Default | Description                                                                                    |
| ------- | ------- | ---------------------------------------------------------------------------------------------- |
| `q`     | `""`    | Search text. Empty or all-punctuation returns empty buckets, never the whole collection.       |
| `scope` | `all`   | One bucket key, or `all`. An unrecognised value is a `422`.                                    |
| `limit` | `500`   | Cap per bucket, 1–2000.                                                                        |

**Matching.** The query and every name column are lowercased and stripped of
whitespace and punctuation before the substring test, so `re zero` finds
`Re:Zero`. This mirrors the frontend's `cleanString` (`frontend/src/lib/naming.js`)
and runs in SQL via `translate()`; the two character lists are kept in step by
hand, in `app/services/domain/search.py`. Note that `%` is on the stripped list
and `_` is not, which is why the `LIKE` autoescapes.

**Ordering.** Within a bucket, whole-title matches come first, then the type's
name column ascending (`comic` sorts on `comic_name_en`, `seasonal` descending).
Sorting in SQL rather than after the fact means an exact match cannot be cut by
`limit` before it is floated.

**Response:** `SearchResponse`

```
{
  "query": "gundam",
  "scope": "all",
  "results": {
    "collection": [...], "franchise": [...], "series": [...],
    "anime": [...], "anime-movie": [...], "movie": [...], "tv-show": [...],
    "cartoon": [...], "manga": [...], "novel": [...], "comic": [...],
    "seasonal": [...]
  },
  "related_franchises": [...]
}
```

Every bucket key is always present, empty for the types the scope did not ask
about. Rows carry the same response schema as that type's own list endpoint —
plan flags, link fields, RBAC visibility, and field gating all included.

**Franchise expansion.** At `scope=all`, a franchise whose name matched brings
its anime with it, so searching a franchise name finds the shows in it even when
none of their own titles contain the query. A scoped anime search does not
expand: that is a question about anime names.

**`related_franchises`** are the franchises the anime results belong to — the
filter pills on the search page. Not the same set as `results.franchise`, which
holds franchises whose own name matched.

---

## Constants — `/api/constants`

Read-only. Serves the Tier 1 closed enums from `app/utils/constants.py` (and
`ITEM_IMPORTANCE` from `watch_order.py`) so the frontend stops keeping its
own copies of `frontend/src/config/weekdays.js` and the hardcoded status
lists. `docs/options.md` remains the canonical documentation of what each
value means; this endpoint just serves them.

| Method | Path | Auth   | Description                                                        |
| ------ | ---- | ------ | ------------------------------------------------------------------- |
| `GET`  | `/`  | Public | Every Tier 1 enum as `{snake_case_field_name: [values...]}`.        |

Keys served: `watching_status`, `reading_status`, `airing_status`,
`anime_airing_type`, `cartoon_airing_type`, `franchise_type`,
`franchise_expectation`, `my_rating`, `is_main`, `movie_type`, `tv_region`,
`manga_region`, `novel_region`, `novel_type`, `comic_type`,
`manga_serialization_status`, `novel_serialization_status`, `day_of_week`,
`music_status`, `seiyuu_status`, `watch_order_importance`, `person_role`,
`media_type`, `option_categories`, `tag_categories`. The last four are for
the admin forms:
`person_role` is derived from `CREDIT_ROLES` in `app/utils/credit_roles.py`
(it replaced a hand-written copy in `OptionsAddTab.jsx`), `media_type` is the
hyphenated `MEDIA_TABLES` keys the option scope picker offers — NOT
person-role scopes, which are the coarser `anime` / `non_anime` split — and
`option_categories` is `OPTION_CATEGORIES`, the Tier 2 category **names** a
tag field reads (never their values, which stay on `GET /api/options`). The
Options form needs the declared names because it otherwise derives its
category list from the options already stored, and so could not offer a
category with no values yet — the state every new tag field starts in.
`tag_categories` is the subset of those categories the Add / Modify / Delete
pages group under their Tags sub-tab, which is navigation only — both
sub-tabs write the same rows. `franchise_type`
and `anime_airing_type` are served from the `FRANCHISE_TYPES` /
`ANIME_AIRING_TYPES` tuples rather than the `FranchiseType` / `AnimeAiringType`
Python `Enum` classes, because the frontend dropdown has diverged from those
enums — see the value-discrepancy note in `docs/options.md`.

---

## Options — `/api/options`

Tier 2 open vocabularies (`system_option` / `system_option_scope`).

| Method   | Path           | Auth   | Description                                                                     |
| -------- | -------------- | ------ | ---------------------------------------------------------------------------------- |
| `GET`    | `/`            | Public | List all system options across all categories. `?scope=` filters to values with no scope rows or a matching one. `?limit=&offset=` paginate. |
| `GET`    | `/{category}`  | Public | List options for a specific category (e.g. `"Genre Main"`, `"Comic Publisher"`). Same `?scope=` filter. |
| `POST`   | `/`            | Admin  | Add a new option. Body: `SystemOptionCreate` (`{category, value, sort_order, remark, scopes: [...]}`). 400 if `(category, value)` already exists. |
| `PUT`    | `/{option_id}` | Admin  | Update an existing option by UUID `system_id`. Body: `SystemOptionCreate`; replaces the option's scope rows wholesale. 400 on a duplicate `(category, value)`. |
| `DELETE` | `/{option_id}` | Admin  | Delete an option by UUID. Cascades its `system_option_scope` and `media_tag` rows. Logs to `deleted_record`.                  |

**Response model:** `SystemOptionResponse` (`{system_id, category, value, sort_order, remark, scopes: [str, ...]}`)

---

## Person — `/api/person`

Tier 3 entity CRUD for people credited on media entries (director, producer,
composer, manga/novel author, illustrator, comic writer/artist).

| Method   | Path              | Auth   | Description                                                                          |
| -------- | ----------------- | ------ | --------------------------------------------------------------------------------------- |
| `GET`    | `/`                | Public | List people. `?role=` filters to those holding a `person_role`; `?scope=` further filters that role (only meaningful for `director`: `anime` \| `non_anime`). |
| `GET`    | `/role-counts`     | Public | How many distinct people hold each `person_role`, zeros included. Declared before `/{system_id}` so the UUID route does not 422 on the literal path. Counts people, not `person_role` rows — a director scoped both ways is one person. Read by the `/options` admin page. |
| `GET`    | `/{system_id}`     | Public | Get one person by UUID.                                                              |
| `POST`   | `/`                | Admin  | Create a person. Body: `PersonCreate` (`PersonBase` fields + `roles: [{role, scope}]`). |
| `PUT`    | `/{system_id}`     | Admin  | Fully update a person, replacing their `person_role` rows wholesale. Body: `PersonUpdate`. |
| `DELETE` | `/{system_id}`     | Admin  | Delete a person. Cascades their `media_credit` and `person_role` rows — no `deleted_record` entry is logged. |
| `POST`   | `/{system_id}/merge` | Admin  | Merge `source_id` into this person: repoints every `media_credit` and unions the `person_role` rows onto the survivor, then deletes the loser. Body: `MergeRequest` (`{source_id}`). 400 if merging into self. |

**Response model:** `PersonResponse` (`PersonBase` fields + `system_id`, `credit_count`) — `credit_count` is a live count of `media_credit` rows, not a stored column.

---

## Studio — `/api/studio`

Tier 3 entity CRUD for anime production studios, plus the reverse-credit
read the public studio page uses. Mirrors `/api/person` without the
role/scope filter — studios have no `person_role` concept.

| Method   | Path                  | Auth   | Description                                                                       |
| -------- | --------------------- | ------ | ------------------------------------------------------------------------------------ |
| `GET`    | `/`                   | Public | List all studios, sorted by `display_name` case-insensitively.                   |
| `GET`    | `/{system_id}`        | Public | Get one studio by UUID. 404 if absent.                                           |
| `GET`    | `/{system_id}/entries`| Public | The entries this studio is credited on, grouped by media type. 404 if the studio is absent. |
| `POST`   | `/`                   | Admin  | Create a studio, **or return the existing one** under that name — find-or-create, because the Add/Modify forms POST here through `ensureSourceValues.js` whenever a typed name is not in the suggestion list. Matching is on the normalized name (`find_studio`); metadata on an existing row is left untouched. Body: `StudioCreate`. |
| `PUT`    | `/{system_id}`        | Admin  | Fully update a studio. Every credit points at the row by id, so a rename here changes what every credited entry shows — there is no propagation step. Body: `StudioUpdate`. |
| `DELETE` | `/{system_id}`        | Admin  | Delete a studio. Cascades its `media_credit` rows — no `deleted_record` entry is logged. Merge, not delete, is the fix for a duplicate. |
| `POST`   | `/{system_id}/merge`  | Admin  | Merge `source_id` into this studio: repoints every `media_credit` (dropping one that would duplicate a credit the survivor already holds), then deletes the loser. Body: `MergeRequest`. 400 if merging into self. |

**Response model:** `StudioResponse` — `StudioBase` fields (the four names,
`display_name_field`, `my_rating`, `logo_file`, `remark`, `founded_date`,
`defunct_date`, `country`, `website_url`, `mal_id`, `mal_link`) plus
`system_id`, the resolved `display_name`, and `credit_count`.

`StudioBase` rejects a payload with no name at all and a `display_name_field`
outside `en` / `cn` / `jp` / `alt` with a 422, mirroring
`ck_studio_has_a_name` so the database's IntegrityError never surfaces as a
500.

**`credit_count` counts only credits on entries the viewer may see.** A number
is a smaller leak than a title, but "worked on 3 things, you can see 2" is
still one, so it runs through `filter_visible_pairs` — the same call
`/entries` uses, which is what keeps the count on the card and the list on the
page from disagreeing.

### `GET /api/studio/{system_id}/entries`

The reverse of `GET /api/credits/{media_type}/{entry_id}`.

```json
{
  "groups": [
    {
      "media_type": "anime",
      "label": "Anime",
      "nav_path": "/anime",
      "entries": [
        {
          "system_id": "…",
          "display_name": "Violet Evergarden",
          "cover_image_file": "…",
          "release_date": "2018-01-11"
        }
      ]
    }
  ]
}
```

Groups follow `MEDIA_TABLES` order and a group with no visible entries is
omitted; entries are newest first, with an undated entry last. A studio whose
every credit is hidden from this viewer answers with empty `groups`, **not**
a 404: a studio carries no content label of its own, so the studio is not the
secret — its credits are.

---

## Credits — `/api/credits`

Read and replace one media entry's `media_credit` / `media_tag` rows as a
single payload, matching how the Add/Modify forms already submit a whole
field's values at once.

| Method | Path                        | Auth   | Description                                                                    |
| ------ | --------------------------- | ------ | ---------------------------------------------------------------------------------- |
| `GET`  | `/{media_type}/{entry_id}`  | Public | Returns `{credits: {role: [names...]}, tags: {field: [values...]}}` — only roles/fields with rows are included; a bare entry returns two empty maps. 400 for an unknown `media_type`, 404 if the entry doesn't exist. |
| `PUT`  | `/{media_type}/{entry_id}`  | Admin  | Replaces the named roles/fields. Body: `{credits: {role: [names...]}, tags: {field: [values...]}}`. A role/field absent from the body is left untouched; one present with an empty list is cleared. Resolves each name to a `person`/`studio`/`system_option` row, creating on miss. 400 for a role/field not valid on this `media_type`. |

`media_type` is one of the hyphenated `MEDIA_TABLES` keys (`anime`,
`anime-movie`, `movie`, `tv-show`, `cartoon`, `manga`, `novel`, `comic`).
Valid roles/fields per media type come from `credit_roles_for()` /
`tag_fields_for()` in `app/utils/credit_roles.py`.

### Reading credits: the entry payload, not this endpoint

Every media entry response — list AND detail — carries its credits and tags as
comma-joined strings under the LEGACY column names the dropped columns used
(`anime.studio`, `anime.music` for the composer credit, `comic.era` for the
`comic_era` tag, and so on; `sheet_column_for()` owns that mapping and the
Sheets export uses the same one). They are attached by
`credits.attach_link_fields()` and defined by the mixins in
`app/schemas/link_fields.py`.

This is what the public detail, library, card and statistics pages read. They
render an entry from ONE response and must not issue a second request per row:
a library page lists hundreds of entries, so `link_values_for_entries()` reads
a whole batch in a fixed number of queries.

These keys are READ-ONLY. They sit on the `*Response` schemas only, never on
the `Create` / `Update` bases, so a write naming one is rejected rather than
silently stored; `PUT /api/credits` is the only writer.

Anime and anime-movie responses also carry `studio_refs`: the same studio
credits as the `studio` string beside them, shaped as
`[{system_id, display_name}]` so the detail pages can link each studio to
`/studio/{system_id}` — the comma-joined string has no ids to link with. It is
built in the same batched pass, so it costs no extra query on a library page.
Being a credit field it is gated with `studio` in the Credits field group
(`app/services/rbac/field_groups.py`): a viewer without that permission gets
neither, and the pages fall back to the plain string when `studio_refs` is
empty.

---

## Announcements — `/api/announcements`

Dashboard "Announcement & Notes" board. Each note is one `system_configs` row keyed
`announcement:<title>`, with the note body as `config_value` — no dedicated table.

| Method   | Path | Auth   | Description                                                                                     |
| -------- | ---- | ------ | ----------------------------------------------------------------------------------------------- |
| `GET`    | `/`  | Public | List all announcements in creation order (`system_configs.id`).                                 |
| `POST`   | `/`  | Admin  | Add a note. Body: `AnnouncementCreate` (`{title, body}`). 409 if the title exists.               |
| `PUT`    | `/`  | Admin  | Update / rename. Body: `AnnouncementUpdate` (`{original_title, title, body}`). 404 / 409.        |
| `DELETE` | `/`  | Admin  | Delete by `?title=` query param. 404 if missing.                                                 |

Titles travel in the body or query string, never the path — free-text titles may contain `/`.
Empty titles/bodies and titles over 120 chars are rejected with 400.

---

## Form Defaults — `/api/form-defaults`

Backs the admin **Form Defaults** page (`/defaults`). Per media type it stores the
initial value of each Add-form field and which fields auto-fill copies. Like
announcements, it reuses `system_configs` — one row per media type, keyed
`form_defaults:<media_type>`, with a JSON blob as `config_value`. No dedicated table.

`media_type` is one of the nine `MEDIA_CONFIG` slugs (`anime`, `anime-movie`, `movie`,
`tv-show`, `cartoon`, `manga`, `novel`, `franchise`, `series`); anything else is 400.

| Method   | Path            | Auth  | Description                                                                     |
| -------- | --------------- | ----- | ------------------------------------------------------------------------------- |
| `GET`    | `/`             | Admin | All configured types, keyed by media type. Unconfigured types are omitted.       |
| `GET`    | `/{media_type}` | Admin | One type. Unconfigured returns **200 with an empty payload**, never 404.         |
| `PUT`    | `/{media_type}` | Admin | Full-replacement upsert. Body: `FormDefaultsPayload`.                            |
| `DELETE` | `/{media_type}` | Admin | Reset to built-in values (deletes the row). Idempotent — missing row still 200.  |

**Response model:** `FormDefaultsResponse` (`FormDefaultsPayload` + `media_type`)

**Payload shape:**

```json
{
  "version": 1,
  "defaults": { "watching_status": "Plan to Watch", "ep_total": "12" },
  "autofill": ["anime_name_en", "franchise_id", "studio"]
}
```

- `defaults` is **sparse** — only fields the admin overrode. An absent key means "use the
  frontend's built-in factory value", which is what makes per-field revert a key deletion.
- `autofill` is **null-or-complete**. `null`/omitted → use the built-in field set; `[]`
  genuinely means "copy nothing". The two are not interchangeable.
- Values mirror **frontend form-state** types, not DB column types — numbers are stored as
  strings, checkboxes as booleans.

**Validation.** Shape and size only: value types limited to string/number/bool/null/string-list,
≤200 keys, keys matching `^[a-z0-9_]+$` and ≤64 chars, serialized JSON ≤32 KB. The router
deliberately does **not** mirror the ~280 form field names — that list lives in
`frontend/src/config/formFactories.js`, and duplicating it in Python would guarantee drift.
The frontend's `resolveDefaults()` drops stored keys it no longer recognizes on read.

Unlike announcements, reads are admin-only: there is no guest surface for form config.
A row whose JSON fails to parse is logged and treated as unconfigured, never a 500.

**Response model:** `AnnouncementResponse` (`{title, body}`)

---

## Data Control — `/api/data-control`

All endpoints in this router require admin authentication.

The per-type Fill / Replace routes are **generated** from `PIPELINES` (`app/services/pipelines/specs.py`) by `_register_media_routes` in `app/routers/data_control.py`, so a new media type gets its routes by adding a spec, not a handler. Each spec yields `POST /fill/{key}` and `POST /replace/{key}/{entry_id}` always, and `POST /replace/{key}` (bulk) only when the spec has a `replace_select` — every type except comic.

### Fill

| Method | Path                | Description                                                                  |
| ------ | ------------------- | ---------------------------------------------------------------------------- |
| `POST` | `/fill/anime`       | Fill missing metadata for all anime from Tenrai. Streams SSE progress.        |
| `POST` | `/fill/anime-movie` | Fill missing metadata for all anime movies from Tenrai. Streams SSE progress. |
| `POST` | `/fill/movie`       | Fill missing metadata for all movies from TMDB/OMDb. Streams SSE progress.   |
| `POST` | `/fill/tv-show`     | Fill missing metadata for all TV shows from TMDB/OMDb. Streams SSE progress. |
| `POST` | `/fill/cartoon`     | Fill missing metadata for all cartoons from TMDB/OMDb. Streams SSE progress. |
| `POST` | `/fill/manga`       | Fill missing metadata for all manga from Tenrai. Streams SSE progress.        |
| `POST` | `/fill/novel`       | Fill missing metadata for all novels from Tenrai. Streams SSE progress.       |
| `POST` | `/fill/comic`       | Runs options extraction for all comics. No external call — comics are manual-entry. Streams SSE progress. |
| `POST` | `/fill/all`         | Fill all + auto-backup on completion. Streams SSE progress.                  |

### Replace

| Method | Path                                    | Description                                                                          |
| ------ | --------------------------------------- | ------------------------------------------------------------------------------------ |
| `POST` | `/replace/anime`                        | Replace (overwrite) metadata for all anime that have a MAL ID. Streams SSE progress. |
| `POST` | `/replace/anime/{entry_id}`             | Replace metadata for a single anime entry by UUID. Returns JSON.                     |
| `POST` | `/replace/anime-movie`                  | Replace metadata for all anime movies that have a MAL ID. Streams SSE progress.      |
| `POST` | `/replace/anime-movie/{entry_id}` | Replace metadata for a single anime movie entry by UUID. Returns JSON.               |
| `POST` | `/replace/movie`                        | Replace metadata for all movies that have an IMDb ID. Streams SSE progress.          |
| `POST` | `/replace/movie/{entry_id}`             | Replace metadata for a single movie entry by UUID. Returns JSON.                     |
| `POST` | `/replace/tv-show`                      | Replace metadata for all TV shows that have an IMDb ID. Streams SSE progress.        |
| `POST` | `/replace/tv-show/{entry_id}`         | Replace metadata for a single TV show entry by UUID. Returns JSON.                   |
| `POST` | `/replace/cartoon`                      | Replace metadata for all cartoons that have an IMDb ID. Streams SSE progress.        |
| `POST` | `/replace/cartoon/{entry_id}`         | Replace metadata for a single cartoon entry by UUID. Returns JSON.                   |
| `POST` | `/replace/manga`                        | Replace metadata for all manga that have a MAL ID. Streams SSE progress.             |
| `POST` | `/replace/manga/{entry_id}`             | Replace metadata for a single manga entry by UUID. Returns JSON.                     |
| `POST` | `/replace/novel`                        | Replace metadata for all novels that have a MAL ID. Streams SSE progress.            |
| `POST` | `/replace/novel/{entry_id}`             | Replace metadata for a single novel entry by UUID. Returns JSON.                     |
| `POST` | `/replace/comic/{entry_id}`             | Runs the Replace write hook for a single comic entry. Fetches nothing — comics are manual-entry, so there is no external record to reconcile against; it exists only so the write is logged like every other type's. Returns JSON. |
| `POST` | `/replace/all`                          | Replace all + auto-backup on completion. Streams SSE progress.                       |

**Single replace error mapping.** A single-entry Replace returns the pipeline's status dict; when `status == "error"` the router raises the HTTP code the dict names in `status_code` (404 for a missing entry) and falls back to **400** otherwise, instead of answering 200 with an error body.

**No bulk `/replace/comic`.** Bulk replace exists to re-fetch every entry from an external source (MAL ID for anime/manga/novel, IMDb ID for movie/TV/cartoon). Comic has no external source — no `mal_*`/`anilist_*` columns and no MAL/AniList/TMDB/OMDb involvement — so there is nothing for a bulk pass to re-fetch, and no `execute_replace_comic` or `/replace/comic` route exists.

### Backup & Pull

| Method | Path               | Description                                                                                   |
| ------ | ------------------ | --------------------------------------------------------------------------------------------- |
| `POST` | `/backup`          | Backup entire DB to Google Sheets. Synchronous, returns JSON.                                 |
| `POST` | `/pull`            | Pull all tabs from Google Sheets, entities before entries (System Options → System Option Scope → Person → Person Role → Studio → System Configs → Collection → Franchise → Series → Anime → ...). Returns JSON. See `external-apis.md` for the full order and why Backup must run before Pull. |
| `POST` | `/pull/manga`      | Pull Manga tab from Google Sheets. Returns JSON.                                              |
| `POST` | `/pull/novel`      | Pull Novel tab from Google Sheets. Returns JSON.                                              |
| `POST` | `/pull/comic`      | Pull Comic tab from Google Sheets. Returns JSON.                                              |
| `POST` | `/pull/cartoon`    | Pull Cartoon tab from Google Sheets. Returns JSON.                                            |
| `POST` | `/pull/{tab_name}` | Pull a single tab by name. Returns JSON. An unknown tab name is **400** (`Unknown tab: …`). The four literal `/pull/<type>` routes above are generated from `MEDIA_TYPE_FOR_TAB` for manga/novel/comic/cartoon and declared before this one. |

### Calculate

| Method   | Path                                 | Description                                                                                 |
| -------- | ------------------------------------ | ------------------------------------------------------------------------------------------- |
| `POST`   | `/calculate/all`                     | Run full Calculate All pipeline (post-processing, derive, sync, cover check). Returns JSON. |
| `GET`    | `/calculate/check-cover-image`       | Report on missing and orphaned cover images. Optional query param `entry_type`.             |
| `POST`   | `/calculate/set-cover-image-fields`  | Populate `cover_image_file` fields for entries whose file already exists in storage.        |
| `POST`   | `/calculate/download-missing-covers` | Re-download missing cover images. Body: `{system_ids?: string[]}`.                          |
| `DELETE` | `/calculate/delete-orphaned-covers`  | Delete orphaned cover image files from storage. Returns `{deleted_count}`.                  |
| `GET`    | `/check/duplicates`                  | Find and report all duplicate entries across all tables. Returns grouped clusters.          |
| `GET`    | `/check/remarks`                     | Check all comments and remark fields, acting as the Comments/Remarks Review Queue.          |

**SSE response format** (streaming endpoints): `text/event-stream` — each event is a JSON string with `{status, current_entry, processed, total}`.

---

## System — `/api/system`

All endpoints in this router require admin authentication.

### Configuration

| Method | Path                     | Description                                                                       |
| ------ | ------------------------ | --------------------------------------------------------------------------------- |
| `GET`  | `/config/current_season` | Get the current season setting from `system_configs`. Returns `{current_season}`. |
| `POST` | `/config/current_season` | Set the current season. Body: `{current_season: "YYYY SSS"}`.                     |

### Data Control Logs

| Method   | Path             | Description                                                                 |
| -------- | ---------------- | --------------------------------------------------------------------------- |
| `GET`    | `/logs`          | Get the 50 most recent `DataControlLog` entries.                            |
| `DELETE` | `/logs`          | Delete all log entries except the 10 most recent. Returns `{deleted: int}`. |
| `DELETE` | `/logs/{log_id}` | Delete a single log entry by integer ID.                                    |

### Deleted Records

| Method   | Path                   | Description                                                                           |
| -------- | ---------------------- | ------------------------------------------------------------------------------------- |
| `GET`    | `/deleted`             | Get the 50 most recent `DeletedRecord` entries.                                       |
| `DELETE` | `/deleted`             | Delete all deleted record entries except the 5 most recent. Returns `{deleted: int}`. |
| `DELETE` | `/deleted/{record_id}` | Delete a single deleted record entry by integer ID.                                   |

### Diagnostics

| Method | Path           | Description                                                                                          |
| ------ | -------------- | ---------------------------------------------------------------------------------------------------- |
| `POST` | `/test-bucket` | Test GCS write permissions by uploading a diagnostic image. Returns `{status, message, public_url}`. |

---

## Watch Order — Sections

The grouping tier above a watch order's items. All five require admin, and all
refuse a built-in (generated) list, the same way the item endpoints do.

| Method | Path | Body | Notes |
| --- | --- | --- | --- |
| POST | `/api/watch-order/lists/{system_id}/sections` | `WatchOrderSectionCreate` | Appends unless `position` is given. `position` is measured against the **items**, since it only anchors the part while it is empty. |
| PUT | `/api/watch-order/sections/{section_id}` | `WatchOrderSectionUpdate` | Full update. |
| PATCH | `/api/watch-order/sections/{section_id}` | free dict | Partial: name, position, remark. |
| DELETE | `/api/watch-order/sections/{section_id}` | — | Steps are **not** deleted; `section_id` is SET NULL and they become ungrouped. |
| PUT | `/api/watch-order/lists/{system_id}/sections/reorder` | `WatchOrderSectionReorder` | Renumbers 1..N. Payload must name every section exactly once. Only moves **empty** parts — a part with steps reads where its steps read, so it is moved by reordering them. |

`GET /api/watch-order/lists/{system_id}` also returns `sections`. `items` stays
a **flat list in reading order** — ordered by `position` alone. Each item names
its `section_id`, and a client wraps each run of *adjacent* steps sharing one
into a part box by walking the flat list once. A part's steps are always
adjacent, so one part is always one box.

An item may only name a section of its own list; `POST`/`PUT`/`PATCH` on an
item, and `reorder`, reject a foreign `section_id` with 400.

`POST /lists/{id}/items` with a `section_id` and no `position` appends to the
end of **that part**, not the end of the list — appending to the tail would
split every part the new step then sat behind.

---

## Authorization

Every read route now resolves a **viewer** (`app/services/rbac/resolver.py`).
An anonymous caller is the `guest` role, which is a real row with real grants —
not a special case. Resolution never raises: a missing, malformed, expired or
badly-signed cookie, a deleted user, or a missing role all fall back to guest.

Permissions are resolved **per request from the database**, not carried in the
JWT, so revoking one takes effect on the holder's next request rather than
whenever their cookie expires. A process-local cache keyed by `role_id` keeps
that to roughly zero queries; every write below calls `rbac.cache.bump()`.

A viewer who may not see something gets **404**, not 403, using each router's
own existing not-found message — a hidden entry is indistinguishable from one
that was never there. Admin gates answer **401**, as they always did.

### `GET /api/auth/me` (extended)

Still never raises, and still carries `is_admin` and `username` unchanged.
Now also returns:

```json
{ "is_admin": false, "username": null, "role": "guest",
  "is_superuser": false, "permissions": ["media_type.anime", ...] }
```

This is where the SPA learns what to draw. Hiding in the UI is cosmetic — the
server has already withheld what the viewer may not see.

### `/api/roles` — admin

| Method | Path | Notes |
|---|---|---|
| GET | `/api/roles/` | Roles with their grants and user counts. |
| GET | `/api/roles/catalog` | Every grantable permission, grouped by family (`admin`, `media_type`, `field_group`, `label`) with human labels. The role editor is built from this, so its checkboxes cannot drift from what the write path accepts. |
| GET | `/api/roles/{id}` | |
| POST | `/api/roles/` | 409 on a duplicate name, 422 on an unknown permission. |
| PATCH | `/api/roles/{id}` | Label, description, sort order. `name` is not editable — code reads `guest` and `admin` by name. |
| PUT | `/api/roles/{id}/permissions` | **Replaces the whole set**, the same contract as `PUT /api/credits/...`. 409 on a superuser role. |
| DELETE | `/api/roles/{id}` | 409 if `is_system` or still held by users. |

Also 409: giving the `guest` role the `admin` permission (anonymous requests
resolve to guest, so that would make every visitor an administrator).
`DELETE` answers **204**.

### `/api/users` — admin

No self-registration; accounts are created here only.

| Method | Path | Body / notes |
|---|---|---|
| GET | `/api/users/` | Every account as `ManagedUserResponse` (`id`, `username`, `role_id`, `role_name`). Passwords never leave the server. |
| POST | `/api/users/` | `ManagedUserCreate` (`username`, `password`, `role_id`). 201. 409 on a taken username, 422 on an unknown role. |
| PATCH | `/api/users/{id}` | `ManagedUserUpdate` — any of `username`, `password`, `role_id`. 409 if the new username is taken, or if the change would demote the last account that can still administer the site. |
| DELETE | `/api/users/{id}` | **204**. 409 if you are deleting yourself, or the last administering account. |

### `/api/content-labels` — admin

Vocabulary CRUD, plus per-entry assignment:

| Method | Path | Body / notes |
|---|---|---|
| GET | `/api/content-labels/` | Every label as `ContentLabelResponse` (`system_id`, `key`, `label`, `description`, `sort_order`, `permission` = `label.<key>`). |
| POST | `/api/content-labels/` | `ContentLabelCreate` (`key`, `label`, `description`, `sort_order`). 201. 409 if the key exists. |
| PATCH | `/api/content-labels/{id}` | `ContentLabelUpdate` — `label`, `description`, `sort_order`. `key` is not editable; the permission string is derived from it. |
| DELETE | `/api/content-labels/{id}` | **204**. Cascades the entry assignments and the role grants for `label.<key>`. |
| GET | `/api/content-labels/entry/{media_type}/{entry_id}` | The label keys this entry carries. |
| PUT | `/api/content-labels/entry/{media_type}/{entry_id}` | `{"label_keys": [...]}` — replaces the set. 400 on an unknown media type, 404 on a missing entry, 422 on an unknown label. |

A newly created label is granted to nobody, so applying it hides the entry from
everyone except superusers until a role is given `label.<key>`. That is the
safe direction.

### What gating touches

Read routes that now consult the viewer: the eight media list/detail routes
(`_factory.py`), `/api/search`, `media_resolver.resolve_entries`,
quote (list/grouped/by-id), meme (list/grouped/by-id), `media_relation`
(`/for-entry`, the scope listing, and `/graph`), `watch_order` (`/lists/{id}`,
`/candidates`), `plan_next`, `credits`, `notes`, and the `credit_count` on
person and studio. Field groups the role lacks are stripped from a copy of the
row before serialisation (`docs/authorization.md`).

**Accepted residuals**, documented rather than fixed: `seasonal` counts are
precomputed over all entries and over-count for a restricted viewer;
franchise/series/collection hubs carry no labels and may render as empty
shells; `/static/covers/<entry_id>.*` is served straight from disk by
`StaticFiles`, so hiding an entry does not hide its cover.
