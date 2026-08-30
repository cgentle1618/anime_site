# Data actions (admin Data Control)

Last verified: 2026-08-30 (commit 4339702)

## What this is for

The admin Data Control page is where the whole database gets maintained in bulk: **Backup** copies every table to Google Sheets, **Pull** restores tables from those sheets, **Fill** fetches missing metadata from the external APIs, **Replace** re-fetches metadata and overwrites what is there, **Calculate All** re-runs every derivation, and a few smaller actions maintain cover images and surface duplicates and remarks. This page explains what each action does step by step, what it logs, and the exact routes behind it. It does not repeat table definitions (see [data-model.md](data-model.md)), derivation rules (see [business-rules.md](business-rules.md)) or the external services themselves (see [external-apis.md](external-apis.md)).

Code map:

| File | Owns |
|---|---|
| `app/routers/data_control.py` | every `/api/data-control/...` route |
| `app/services/pipelines/runner.py` | the one Fill / Replace loop (`run_fill`, `run_replace`, `run_replace_single`, `run_all`) and the SSE messages |
| `app/services/pipelines/specs.py` | `PIPELINES` — what varies per media type (`PipelineSpec`) |
| `app/services/pipelines/fill.py`, `replace.py` | named entry points (`execute_fill_anime`, `execute_replace_single_movie`, ...) bound to a spec |
| `app/services/pipelines/tabs.py` | `SHEET_TABS` — the one registry of sheet tabs, in restore order |
| `app/services/pipelines/backup.py` | `execute_backup` |
| `app/services/pipelines/pull.py` | `execute_pull_specific`, `execute_pull_all` |
| `app/services/calculation.py` | `run_calculate_all` and the cover-image bulk actions |
| `app/utils/data_control_utils.py` | `log_data_control` (the audit row) and `log_deleted_record` |

All routes are admin-only: the router is declared with `dependencies=[Depends(get_current_admin)]`.

---

## 1. Backup

`execute_backup(db, action_type)` in `backup.py`. Called by `POST /api/data-control/backup` (`action_type="Manual"`) and automatically at the end of Fill All / Replace All (`action_type="Auto"`).

Steps, for each tab in `SHEET_TABS` order (section 2 lists it):

1. `db.query(tab.model).all()` — every row of the table.
2. Headers are the model's column names (`tab.model.__table__.columns`); each row is formatted with `format_model_for_sheet`.
3. If the tab has a `media_type` (the eight entry tabs), the credit and tag link columns are appended **after** the plain columns: `sheet_link_headers(media_type)` gives the legacy header names (studio, director, genre_main, ...) and `sheet_link_rows(db, media_type, rows)` fills them as comma-joined names in a fixed number of queries. Pull matches these by header name, never by position, so appending them is safe.
4. `bulk_overwrite_sheet(tab.name, [headers] + matrix)` (`app/services/integrations/sheets.py`): **write first, trim after**. It updates from `A1` with `USER_ENTERED`, then `batch_clear`s only the cells beyond the new data (rows below, columns to the right). A failed write therefore leaves the previous backup intact rather than a blank tab. An empty matrix raises `ValueError` — Backup refuses to blank a tab.

Outcome:

| Result | Log row | HTTP |
|---|---|---|
| all tabs written | `Backup` / `Backup` / `Success` | 200 `{"status": "success", "message": "All tabs backed up to Google Sheets"}` |
| any exception | `Backup` / `Backup` / `Failed` with `error_message` | the exception is re-raised (500) |

---

## 2. Sheet tab registry (`tabs.py`)

`SHEET_TABS` is the single list Backup writes and Pull restores. Its order is the **restore** order and is strict: a parent tab precedes every tab that points at it, through a real FK or an FK-less `(media_type, entry_id)` pair.

| # | Tab name | Model | `media_type` key |
|---|---|---|---|
| 1 | `System Options` | `SystemOption` | |
| 2 | `System Option Scope` | `SystemOptionScope` | |
| 3 | `Person` | `Person` | |
| 4 | `Person Role` | `PersonRole` | |
| 5 | `Studio` | `Studio` | |
| 6 | `System Configs` | `SystemConfigs` | |
| 7 | `Collection` | `Collection` | |
| 8 | `Franchise` | `Franchise` | |
| 9 | `Series` | `Series` | |
| 10 | `Anime` | `Anime` | `anime` |
| 11 | `Anime Movie` | `AnimeMovies` | `anime-movie` |
| 12 | `Movies` | `Movies` | `movie` |
| 13 | `TV Shows` | `TVShows` | `tv-show` |
| 14 | `Cartoons` | `Cartoon` | `cartoon` |
| 15 | `Manga` | `Manga` | `manga` |
| 16 | `Novel` | `Novel` | `novel` |
| 17 | `Comic` | `Comic` | `comic` |
| 18 | `Watch Order List` | `WatchOrderList` | |
| 19 | `Watch Order Section` | `WatchOrderSection` | |
| 20 | `Watch Order Item` | `WatchOrderItem` | |
| 21 | `Media Relation` | `MediaRelation` | |
| 22 | `Plan Next` | `PlanNext` | |
| 23 | `Quote` | `Quote` | |
| 24 | `Meme` | `Meme` | |
| 25 | `Note` | `Note` | |
| 26 | `Seasonal` | `Seasonal` | |

Note the tab for the `anime_movies` table is named `Anime Movie` (singular), while `Movies`, `TV Shows` and `Cartoons` are plural. Derived lookups: `TAB_BY_NAME`, `TAB_NAMES`, `TAB_MODELS`, `TAB_PARSERS`, `MEDIA_TYPE_FOR_TAB` (only the eight entry tabs).

---

## 3. Pull (restore from Google Sheets)

### 3.1 One tab — `execute_pull_specific(db, tab_name, action_type, log_action)`

Returns a status dict; the router turns `"status": "error"` into an HTTP error.

1. **Unknown tab** → `{"status": "error", "message": "Unknown tab: ..."}` (400, nothing logged).
2. **Read** `get_all_raw_rows(tab_name)`. A `SheetsUnavailableError` (any read failure) logs `Pull {tab}` / `Failed` and returns `{"status": "error", "reason": "sheet_unavailable"}`. An outage is never mistaken for an empty tab.
3. **Empty tab** (fewer than 2 rows) → logs `Success` and returns `processed: 0`.
4. For every non-blank data row:
   - `parse_row_to_dict(headers, row)` then the tab's parser from `TAB_PARSERS`.
   - **Header filter**: keep only keys that were in the sheet's header row. Parsers emit their full key set, so without this a sheet predating a migration would null the new column on every Pull. A blank cell under a present header is kept and still means "clear this value".
   - **Link columns popped**: for entry tabs, each credit role and tag field header (`sheet_column_for(media_type, key)`) is popped out of the dict into `pending_credits` / `pending_tags` — they are no longer real columns on the model.
   - **Parent resolution** (names in the sheet → UUIDs):

     | Tab | How |
     |---|---|
     | `TV Shows`, `Cartoons`, `Manga`, `Novel`, `Comic`, `Movies` | `resolve_*_parent_hierarchy(db, franchise, series, name_fields)` — auto-creates the franchise if missing, looks up the series |
     | `Anime Movie` | `resolve_anime_movie_parent_hierarchy(db, franchise, name_fields)` when `franchise_id` is `None` or a string (auto-creates the franchise; no series) |
     | any other tab with a string `franchise_id` | look up `Franchise` by en/cn/jp/alt name; **not found → row skipped** |
     | string `collection_id` | look up `Collection` by any of its five names; not found → set to `None`, row kept (collection is optional) |
     | string `series_id` | look up `Series` by en/cn/alt name; **not found → row skipped** |

   - **Primary key field**: `id` for `System Configs`, `Person Role`, `System Option Scope`; `seasonal` for `Seasonal`; `system_id` for everything else.
   - **Id-less matching**: when the PK cell is blank the row is matched to an existing local row by a natural key so a re-import updates instead of duplicating:

     | Tab | Matched on |
     |---|---|
     | `Franchise` | `franchise_name_en` or `franchise_name_cn` |
     | `Collection` | `collection_name_en` or `collection_name_cn` |
     | `System Configs` | `config_key` (UNIQUE — a blind insert would roll back the whole tab) |
     | `Watch Order List` | `list_name` + `franchise_id` + `collection_id` |
     | `Meme` | `owner_type` + `owner_id` + `text` |
     | `Note` | `owner_type` + `owner_id` + `section` + `content` (content may be `None`) |
     | `Quote` | `media_type` + `entry_id` + `text` |
     | `Series` | `series_name_en` or `series_name_cn` |
     | `Anime`, `Anime Movie`, `Movies`, `TV Shows`, `Cartoons`, `Manga` | the type's `*_name_en` or `*_name_cn` |
     | everything else (incl. `Novel`, `Comic`, `Watch Order Item`) | no natural key — an id-less row always inserts |

     If matched, the local PK is used; otherwise the PK key is dropped so the database mints one.
   - **Remark notes**: a `Note` row with `section == "remark"` is retargeted at the owner's existing remark row (the `ix_note_one_remark_per_owner` index allows only one), keeping the local `system_id`.
   - **Target row**: `existing = query(Model).filter(pk == pk_value)` when a PK is present.
   - **INSERT-only defaults** (never applied to an UPDATE, so a sheet that omits a column cannot wipe a good value):

     | Tab | Defaults |
     |---|---|
     | `Anime`, `Movies`, `Anime Movie`, `TV Shows`, `Cartoons` | `watching_status = "Might Watch"`, `created_at` / `updated_at = get_taipei_now()` |
     | `Manga` | `reading_status = "Might Read"`, `created_at` / `updated_at` |
     | `Collection`, `Franchise`, `Series` | `created_at` / `updated_at` (non-nullable on these models) |

     `Novel` and `Comic` get no `reading_status` default here; they rely on their parsers.
   - **Upsert**: existing → `setattr` every remaining key (`rows_updated += 1`); otherwise `Model(**dict)` + `db.add` (`rows_added += 1`).
   - **Link columns applied**: after the row exists (a fresh insert is `db.flush()`ed first so `system_id` is real), `replace_credits` / `replace_tags` are called per popped column with `names_from_sheet_value(raw)`.
   - `db.flush()` every 50 rows so newly minted UUIDs are visible to later FK references.
5. **Commit** once per tab. A commit failure rolls back the entire tab, logs `Failed`, returns `{"status": "error"}`.
6. **Sequence resync**: because Postgres does not advance a sequence when ids are supplied explicitly, after restoring `System Configs`, `Person Role` or `System Option Scope` the matching `*_id_seq` is `setval`'d to `MAX(id) + 1`. `System Options` is deliberately not in this list — its key is a UUID.
7. Log `Pull {tab_name}` / `Success` with `rows_added` / `rows_updated`; return `{"status": "success", "processed", "rows_added", "rows_updated"}`.

### 3.2 Pull All — `execute_pull_all(db, action_type)`

Runs `execute_pull_specific` for every tab in `TABS_IN_ORDER` (= `TAB_NAMES`), each with `action_type="Manual"` and `log_action=True`, so **every tab logs its own row** in addition to the master `Pull All` row.

Skip-unreadable policy: a tab whose result has `reason == "sheet_unavailable"` is recorded in `unread_tabs` and the run **continues**; any other error stops the run (`Exception("Pull failed on tab ...")`).

| Outcome | Master log row | Response |
|---|---|---|
| every tab restored | `Pull` / `Pull All` / `Success`, totals, `details_json` = `{tab: processed}` | 200 `{"status": "success", "details": {...}}` |
| one or more tabs unreadable | `Failed`, `error_message` = `"Full Pull Pipeline incomplete. Tabs not pulled: ..."`, `details_json` = `{"pulled": ..., "unread": ...}` | raises `SheetsUnavailableError` (500) |
| any other error | `Failed` with the message | re-raised (500) |

---

## 4. Fill (fetch what is missing)

`run_fill(spec, db, request, ...)` in `runner.py` is an SSE generator. What varies per type comes from `PIPELINES[key]` in `specs.py`.

Steps:

1. Load every row of `spec.model`. If the spec has `extract_id`, run it on **every** entry (parse the MAL / IMDb / Comic Vine id out of the pasted link) and commit.
2. Queue = entries where `spec.fill_eligible(db, entry)` is true. Empty queue → one progress message `"No entries need filling."`.
3. Per queued entry: check the client is still connected; if `spec.budget` exists and returns `False`, stop and remember how many were left; emit progress with the entry's `display_name`; run `spec.fill` in a worker thread (`run_in_threadpool`, so the event loop and other requests stay alive during the synchronous `requests` calls) and commit. One failing entry is rolled back and logged; the run continues. Then `asyncio.sleep(spec.fill_sleep)` if set.
4. If `spec.post_process` exists, emit `"Running post-processing..."` and run it on **every** entry of the type (not just the queue), then commit.
5. Run each `fill_after` step in order, emitting its message first.
6. Log `Fill` / `Fill {label}` / `Success` with `rows_updated` = entries filled. Final SSE `success` message, with `"N entries skipped - the external API's budget was reached. Run again later to finish."` appended when the budget stopped the loop.

Per type (verbatim from `specs.py`):

| Key | Eligible when | Autofill | Sleep | Post-process (every entry) | After steps (in order) | Budget |
|---|---|---|---|---|---|---|
| `anime` | `mal_id` set and `has_missing_values_anime` | `autofill_anime_from_mal(e, force_replace_ratings=True)` | `MAL_PAUSE` = 1 s | `anime_post_processing` | `"Deriving episode counts..."` → `derive_ep_previous_all_anime`; `"Syncing seasonal data..."` → `run_sync_anime` | — |
| `anime-movie` | `mal_id` set and `has_missing_values_anime_movie` | `autofill_anime_movie_from_mal(e, force_replace_ratings=True)` | 1 s | `anime_movie_post_processing` | `"Syncing system options..."` → `run_sync_anime_movie` | — |
| `movie` | `has_missing_values_movie` | `autofill_movie_from_imdb(e, db)` | 0 | — | — | — |
| `tv-show` | `has_missing_values_tv_show` | `autofill_tv_show_from_imdb(e, db)` | 0 | `tv_show_post_processing` | `"Syncing system options..."` → `run_sync_tv_show` | — |
| `cartoon` | `airing_type in {"Movie", "TV"}` and `has_missing_values_cartoon` | `autofill_cartoon_from_imdb(e, db)` | 0 | `cartoon_post_processing` | `"Syncing system options..."` → `run_sync_cartoon` | — |
| `manga` | `mal_id` set and `has_missing_values_manga` | `autofill_manga_from_mal(e, force_replace_ratings=True)` | 1 s | `manga_post_processing` | `"Syncing system options..."` → `run_sync_manga` | — |
| `novel` | `mal_link` set and `has_missing_values_novel` | `autofill_novel_from_mal(e, force_replace_ratings=True)` | 1 s | — | `"Syncing system options..."` → `run_sync_novel` | — |
| `comic` | `comicvine_id` set and `has_missing_values_comic(db, e)` | `autofill_comic_from_comicvine(e, db)` | `COMICVINE_PAUSE` = 1 s | — | `"Syncing system options..."` → `run_sync_comic` | `comicvine_rate_limiter.has_capacity` |

`extract_id` per type: `apply_extract_mal_id_anime` (anime, anime-movie), `apply_extract_imdb_id` (movie, tv-show, cartoon), `apply_extract_mal_id_manga_novel` (manga, novel), `apply_extract_comicvine_id` (comic).

**Comic Vine budget stop**: the limiter allows 200 requests per rolling hour. Before each comic, `has_capacity()` is checked; when it is `False` the loop breaks instead of blocking, and the remaining count is reported in the final message. The run still logs `Success`.

**Fill All** (`execute_fill_all` → `run_all("Fill", FILL_ALL, ...)`) runs the specs with `in_fill_all=True` in `PIPELINES` order — anime, anime-movie, movie, tv-show, cartoon, manga, novel — and **excludes comic** (`in_fill_all=False`, because its budget is hourly). Then it runs `execute_backup(db, action_type="Auto")` and logs one master row `Fill` / `Fill All`. Sub-pipelines run with `log_action=False` and write no rows of their own. If any sub-pipeline emitted an `error` event, the master row is `Failed` with the joined messages, Backup is skipped, and the stream ends with an `error` event `"Fill All completed with errors: ..."`.

---

## 5. Replace (re-fetch and overwrite)

### 5.1 Bulk — `run_replace(spec, ...)` (SSE)

1. `spec.replace_select(db)` picks the entries: for most types `_linked(Model, id_col, link_col)` — rows with `mal_id`/`mal_link` (anime, anime-movie, manga, novel) or `imdb_id`/`imdb_link` (movie, tv-show) not null. Cartoon additionally requires `airing_type in ["Movie", "TV"]`. Comic has `replace_select=None` — **no bulk Replace** for comics.
2. Zero entries → logs `Success` with `rows_updated=0` and emits an `info` event `"No {type} entries found to replace"`.
3. Per entry: connection check, progress event, `spec.replace(db, entry, bulk=True)` in a worker thread, commit; failure is rolled back and logged, the run continues; then `replace_sleep` (1 s for the four MAL types, 0 for TMDB/OMDb types).
4. `replace_after` steps: same as the type's `fill_after` for anime (`derive_ep_previous_all_anime`, `run_sync_anime`), anime-movie, tv-show, cartoon, manga, novel; none for movie.
5. Log `Replace` / `Replace {label}` / `Success`, `rows_updated` = replaced count.

`spec.replace` per type: `apply_single_replace_anime(db, e, bulk=bulk)`, `apply_single_replace_anime_movie(db, e)`, `apply_single_replace_movie(db, e, bulk=bulk)`, `apply_single_replace_tv_show(db, e, bulk=bulk)`, `apply_single_replace_cartoon(db, e, bulk=bulk)`, `apply_single_replace_manga(db, e, bulk=bulk)`, `apply_single_replace_novel(db, e, bulk=bulk)`.

**Replace All** (`execute_replace_all` → `run_all("Replace", REPLACE_ALL, ...)`) covers the seven types with `in_replace_all=True` (comic excluded), then Backup (`Auto`), one master row `Replace` / `Replace All`, same error handling as Fill All.

### 5.2 Single entry — `run_replace_single(spec, db, entry_id, ...)`

Returns a status dict, never raises. `action_specific` is `"Replace for single {label} entry"`.

1. Look up `spec.model.system_id == entry_id`; missing → logs `Failed` (`"{label} not found 404"`) and returns `status_code: 404`.
2. If the spec has `replace`, run it with `bulk=False` in a worker thread; commit.
3. Run every `single_after` function: `run_sync_anime` (anime), `run_sync_anime_movie`, `run_sync_cartoon`, `run_sync_manga`, `run_sync_novel`, `run_sync_comic`. Movie and TV Show have none. Comic has no `replace` at all, so its single hook only re-syncs system options.
4. Log `Replace` / `Success` with `rows_updated=1`; return `{"status": "success", "message": "Successfully updated {display_name}."}`. Any exception → rollback, log `Failed`, `status_code: 500`.

**Write hooks.** The same `execute_replace_single_*` functions are the registry's `write_hook` (`app/registry.py`) for movie, tv-show, cartoon, manga, novel and comic: the CRUD router factory (`app/routers/_factory.py`, `_run_write_hook`) calls them after every create and update with `action_type="Auto"`, `log_action=False`, and swallows failures (the row is already committed; a 500 here made the SPA retry and create duplicates). Anime instead runs `apply_single_replace_anime(db, anime, force_replace_ratings=False)` synchronously **before** commit (`pre_commit_hook`, `app/services/domain/anime_write.py`); anime movie has no hook.

The manual route `POST /replace/{key}/{entry_id}` calls the same function with `action_type="Manual"`, `log_action=False` — so a single Replace never writes a `DataControlLog` row, whichever way it is triggered.

---

## 6. Calculate All

`run_calculate_all(db)` in `app/services/calculation.py`, in this order:

| Step | Function | What it does |
|---|---|---|
| 1 | `run_post_processing` | `anime_post_processing` for every Anime, `anime_movie_post_processing` for every AnimeMovies, `tv_show_post_processing` for every TVShows, `cartoon_post_processing` for every Cartoon, `manga_post_processing` for every Manga; commit after each type. (Movies, Novel and Comic have no post-processing.) |
| 2 | `run_derive_ep_previous` | `derive_ep_previous_all_anime(db)` — anime is the only type with a franchise-wide derived field left |
| 3 | `run_sync` | `run_sync_anime` (`create_missing_seasonal`, `sync_seasonal_counts`, `extract_system_options`), then `run_sync_anime_movie`, `run_sync_tv_show`, `run_sync_cartoon`, `run_sync_manga`, `run_sync_novel`, `run_sync_comic` (each just `extract_system_options`), then `run_sync_size_groups` (`derive_size_groups` + commit) |
| 4 | `bulk_check_cover_image(db)` | runs the cover check; its result is discarded |
| 5 | log | `Calculate` / `Calculate All` / `Manual` / `Success` |

Any exception logs `Failed` with the message and re-raises (500). Response on success: `{"status": "success", "message": "Full calculation complete."}`. Rules behind each step are in [business-rules.md](business-rules.md).

---

## 7. Cover-image maintenance

All in `calculation.py`; storage helpers come from `app/services/integrations/image_manager.py` (`cover_image_exists`, `list_all_cover_images`, `delete_cover_image`). Covers are stored as `{system_id}.jpg`. None of these write a `DataControlLog` row.

| Function | Route | What it does | Response keys |
|---|---|---|---|
| `bulk_check_cover_image(db, entry_type)` | `GET /calculate/check-cover-image` | Lists entries whose `cover_image_file` is set but whose file is missing in storage. With `entry_type` only Anime rows with that `airing_type` are checked; without it all eight types are. Also embeds `bulk_check_unused_cover_images`: files in storage referenced by no row, split into `should_use` (file stem is a known `system_id`) and `orphaned` (unknown stem). | `total_checked`, `missing_count`, `missing[]` (`system_id`, `name`, `entry_type`), `entry_type`, `should_use[]`, `should_use_count`, `orphaned[]`, `orphaned_count` |
| `bulk_set_cover_image_fields(db)` | `POST /calculate/set-cover-image-fields` | For every entry (all eight types) with `cover_image_file` null whose file exists in storage, sets `cover_image_file = "{system_id}.jpg"`. | `updated_count` |
| `bulk_delete_orphaned_cover_images(db)` | `DELETE /calculate/delete-orphaned-covers` | Deletes every `orphaned` file from the check above. | `deleted_count` |
| `bulk_download_missing_covers(db, system_ids)` | `POST /calculate/download-missing-covers` | For entries with `cover_image_file` set but the file missing (optionally limited to `system_ids`), clears the field and re-runs the type's autofill so the cover is downloaded again (`force_replace_ratings=False` for MAL types). Skipped: Anime whose `airing_type` is not in `ALLOWED_AIRING_TYPES`, Novel without `mal_link`, Comic without `comicvine_id`. One commit at the end. | `message`: `"Downloaded X of Y missing cover images."` plus `"N skipped (no Tenrai source for this type)."` when any were skipped |

---

## 8. Check duplicates / remarks

| Route | Function | Returns |
|---|---|---|
| `GET /check/duplicates` | `find_all_duplicates(db)` (`app/services/domain/duplicates.py`) | one key per check: `franchise`, `series`, `anime`, `anime_movie`, `cartoon`, `movie`, `tv_show`, `manga`, `novel`, `comic`, `system_options`, `entities` — each a list of duplicate groups (lists of dicts). Matching rules are in [business-rules.md](business-rules.md). |
| `GET /check/remarks` | `find_all_remarks(db)` (`app/services/domain/remarks.py`) | entries with a non-empty `remark`, grouped by media type (`anime`, `anime_movie`, `movie`, `tv_show`, `cartoon`, ...), newest `updated_at` first, each with `system_id`, its name columns, status and `remark`. |

Neither writes a log row.

---

## 9. The audit log (`DataControlLog`)

`log_data_control(db, action_main, action_specific, action_type, status, rows_added=0, rows_updated=0, rows_deleted=0, error_message=None, details_json=None)` inserts one row into `data_control_logs` and commits on its own; a failure to log is itself only logged, never raised.

| Column | Values used |
|---|---|
| `action_main` | `Fill`, `Replace`, `Pull`, `Backup`, `Calculate` |
| `action_specific` | `Fill {label}`, `Fill All`, `Replace {label}`, `Replace All`, `Replace for single {label} entry`, `Pull {tab_name}`, `Pull All`, `Backup`, `Calculate All` |
| `type` | `Manual` (a button on the admin page) or `Auto` (Backup at the end of Fill/Replace All; write hooks) |
| `status` | `Success`, `Aborted`, `Failed` |
| `rows_added` / `rows_updated` | Pull counts; Fill/Replace put the processed count in `rows_updated` |
| `error_message`, `details_json` | failure text; Pull All's per-tab summary |
| `timestamp` | `get_taipei_now()` |

Status meanings:

- **Success** — the pipeline finished. Per-entry failures inside Fill/Replace do not change this; a Comic budget stop is still Success.
- **Aborted** — the SSE client disconnected (`request.is_disconnected()` raised `CancelledError`); the current entry is rolled back and the count so far is recorded. Only Fill / Replace / Fill All / Replace All can be Aborted.
- **Failed** — an exception escaped the pipeline, or (for `*All`) a sub-pipeline reported an error.

Who logs:

| Action | Logs |
|---|---|
| Fill / bulk Replace of one type from its own button | one row (`log_action=True`) |
| Fill All / Replace All | one master row only — sub-pipelines run with `log_action=False`; the Auto Backup inside it logs its own `Backup` row |
| single Replace (route or write hook) | never (`log_action=False` in both callers) |
| Pull of one tab | one row |
| Pull All | one `Pull All` row **plus** one row per tab (tabs run with `log_action=True`) |
| Backup, Calculate All | one row |
| cover maintenance, checks | nothing |

---

## 10. SSE event shapes

Fill, bulk Replace, Fill All and Replace All stream `text/event-stream`; every event is one line `data: {json}\n\n` built by `_sse(**payload)` in `runner.py`.

| `status` | Fields | When |
|---|---|---|
| `processing` | `current_entry`, `processed`, `total` | before each entry (`current_entry` = `display_name` or `"Unknown {label}"`), before post-processing (`"Running post-processing..."`, `total`/`total`), before each after-step (its message), and `"Synchronizing to Google Sheets..."` (1/1) in `*All` |
| `success` | `message`, `total`, `processed` | the pipeline finished; Fill's message may carry the budget note |
| `info` | `message`, `total: 0`, `processed: 0` | bulk Replace found nothing to replace |
| `error` | `message` (plus `total: 1`, `processed` for the `*All` summary) | the pipeline crashed, or a sub-pipeline under `*All` did |

`run_all` re-emits every sub-pipeline event unchanged and reads them itself to add up `processed` and collect `error` messages. Nothing is emitted on Abort — the client is gone.

---

## 11. Route table — `/api/data-control`

All routes require admin (`get_current_admin`). `{key}` is a hyphenated media type: `anime`, `anime-movie`, `movie`, `tv-show`, `cartoon`, `manga`, `novel`, `comic`. Literal routes are declared before parameterised ones so `/fill/all` and `/pull` are never captured by a sibling.

| Method | Path | Params / body | Response | Does |
|---|---|---|---|---|
| POST | `/fill/all` | — | SSE | Fill All (seven types, no comic) then Auto Backup |
| POST | `/replace/all` | — | SSE | Replace All (seven types, no comic) then Auto Backup |
| POST | `/fill/{key}` | — | SSE | Fill one type (all eight keys) |
| POST | `/replace/{key}` | — | SSE | bulk Replace one type; **not registered for `comic`** (`replace_select is None`) |
| POST | `/replace/{key}/{entry_id}` | path `entry_id` = `system_id` | JSON `{"status": "success", "message"}`; 404 when the entry is missing, 500 on failure | single Replace (all eight keys) |
| POST | `/backup` | — | JSON `{"status", "message"}`; 500 on failure | Backup every tab |
| POST | `/pull` | — | JSON `{"status": "success", "details": {tab: processed}}`; 500 when any tab was unreadable or failed | Pull All |
| POST | `/pull/manga`, `/pull/novel`, `/pull/comic`, `/pull/cartoon` | — | JSON `{"status", "processed", "rows_added", "rows_updated"}` | shortcut to the `Manga`, `Novel`, `Comic`, `Cartoons` tabs (registered from `MEDIA_TYPE_FOR_TAB` for those four media types only) |
| POST | `/pull/{tab_name}` | path = exact tab name from section 2, URL-encoded (`/pull/Anime`, `/pull/Anime%20Movie`, `/pull/TV%20Shows`) | same as above; 400 `Unknown tab: ...` for anything else | Pull one tab |
| POST | `/calculate/all` | — | JSON `{"status", "message"}`; 500 on failure | Calculate All |
| GET | `/calculate/check-cover-image` | query `entry_type` (optional, an Anime `airing_type`) | JSON, see section 7 | cover check |
| DELETE | `/calculate/delete-orphaned-covers` | — | `{"status", "deleted_count"}` | delete orphaned cover files |
| POST | `/calculate/set-cover-image-fields` | — | `{"status", "updated_count"}` | link existing files to rows |
| POST | `/calculate/download-missing-covers` | body `{"system_ids": [..]}` (optional; default all) | `{"status", "message"}` | re-download missing covers |
| GET | `/check/duplicates` | — | JSON, see section 8 | duplicate report |
| GET | `/check/remarks` | — | JSON, see section 8 | remark report |

Fill / Replace / Pull routes for media types are generated from `PIPELINES` and `MEDIA_TYPE_FOR_TAB` at import time; adding a type to those registries adds its routes. The generic listing in [api.md](api.md) covers the same paths in the context of every router.
