# Plan Next

Last verified: 2026-09-10

## What this is for

The Plan page answers two questions: *what do I watch or read next?* and *what do I want to watch or read again?* Both answers are rows in one table, `plan_next`. A row is a mark placed on one thing (an entry, a series, or a franchise) under one media type and one kind (`next` or `rewatch`); un-marking deletes the row. Around that table sit a small vocabulary module that says which media types may be marked at which tier, a Calculate-time derivation of "size buckets" (12 EP / 24 EP / 30+ EP and so on) that the Plan page groups by, a set of virtual `watch_next` / `read_next` / `to_rewatch` / `to_reread` fields on the entry APIs so forms and filters keep working, and a hand-maintained JavaScript copy of the vocabulary. This document walks through each of those, with the file that owns it, so the next change touches all the right places.

## Model

### The `plan_next` table

Owner: `app/models/plan_next.py`. The revisions that built it are in [notes/migrations-history.md](../notes/migrations-history.md).

| Column | Type | Notes |
| --- | --- | --- |
| `system_id` | UUID PK | Row id. `DELETE /api/plan-next/{system_id}` uses it. |
| `kind` | String, NOT NULL, `server_default="next"` | `next` (queue) or `rewatch` (mark). Vocabulary is `KINDS` in `app/utils/plan_next_kinds.py`, validated in the router, not a DB enum. |
| `user_id` | UUID, NOT NULL, FK `users.id` `ON DELETE CASCADE` (`fk_plan_next_user`) | Whose queue this row is. A plan belongs to one account, and deleting the account takes its plans with it. |
| `media_type` | String, NOT NULL | Hyphenated key from `MEDIA_TABLES` (`app/utils/media_resolver.py`): `anime`, `anime-movie`, `movie`, `tv-show`, `cartoon`, `manga`, `novel`, `comic`, `game`. Stored on every row, group scopes included, because it is the Plan page tab - it is **not** the owner kind. |
| `media_id` | UUID, nullable | Entry-scope owner. Its foreign key is the composite `fk_plan_next_media_type` on `(media_id, media_type)` against `media(system_id, media_type)`, so an entry filed under `anime` cannot point at a manga. `ON DELETE CASCADE`. |
| `franchise_id` | UUID, nullable, FK `franchise.system_id` `ON DELETE CASCADE` (`fk_plan_next_franchise`) | Franchise-scope owner. |
| `series_id` | UUID, nullable, FK `series.system_id` `ON DELETE CASCADE` (`fk_plan_next_series`) | Series-scope owner. |
| `remark` | Text, nullable | Free text such as "after the movie". |
| `created_at` / `updated_at` | DateTime | Taipei-time defaults from `app/database.py`. |

Constraints: `ck_plan_next_one_owner`, a `CHECK (num_nonnulls(media_id, franchise_id, series_id) = 1)` so exactly one owner is set; `uq_plan_next_target`, now `UNIQUE NULLS NOT DISTINCT (user_id, kind, media_type, media_id, franchise_id, series_id)` (a franchise can be both queued and marked for rewatch, so `kind` is part of the key, and `NULLS NOT DISTINCT` is needed because two owner columns are NULL on every row); and index `ix_plan_next_user_kind_type` on `(user_id, kind, media_type)`, which is exactly how the Plan page reads one tab of one section for one user.

There is **no collection scope**. `SCOPES` is `("entry", "series", "franchise")`, so the disjoint set is three columns rather than four; a `collection_id` here could never be written, because the API rejects any scope outside `SCOPES`. `note` and `meme` resolve through the full `OWNER_TABLES` and carry a fourth owner column for collections.

`scope` and `target_id` survive as **derived read-only properties** on the model. `OWNER_COLUMN` maps a scope to its column, `owner_kwargs(scope, target_id)` builds the constructor argument, and `scope_for_columns(...)` reads the direction back - all in `app/utils/plan_next_kinds.py`. They stay because they are the API's wire format, the key `drop_hidden_rows` reads, and what the Plan page's JSON and the Google Sheets tab carry: the fact is stored once and read two ways.

Four design points worth knowing:

- **Row existence is the flag.** There is no `is_next` column. Marking inserts, un-marking deletes, so the table only ever holds what is actually planned.
- **The owner is three real foreign keys** - `media_id` / `franchise_id` / `series_id` - not the FK-less `(scope, media_type, target_id)` contract that `media_relation` and `watch_order_item` still use. Every owner cascades in the database, so there is no `delete_plans_for` to call and a dangling plan row cannot exist: `missing: true` is unreachable for these rows, though the field stays on the schema.
- **A plan queue is private.** Every `/api/plan-next` route requires an account (`Depends(get_current_user_id)`, 401 otherwise) and answers only with the caller's own rows; `/plan` redirects a logged-out visitor to `/login?next=...`. There is no site-owner fallback and no public view of anybody's queue.
- **`kind` has a server default, and that is load-bearing.** A Google Sheets "Plan Next" tab backed up before `kind` existed has no `kind` header. `app/services/pipelines/pull.py` drops every parsed key the header did not carry, so the ORM builds the row with `kind` unset. SQLAlchemy sends an unset NOT NULL column as an explicit `NULL` unless the *model* declares a default, and that fails the NOT NULL check; a database-side `SET DEFAULT` alone does not help because the NULL is sent explicitly. Declaring `server_default="next"` on the model makes SQLAlchemy omit the column so PostgreSQL fills it. A row carrying no `kind` is a queue entry rather than a rewatch mark, so `next` is the right answer. The column carries the same default, so the database and the model agree.

### Size buckets on franchise and series

Owner: `app/services/domain/size_group.py` (pure arithmetic), `app/services/domain/plan_next.py` (the Calculate sweep), columns on `app/models/franchise.py` (both `Franchise` and `Series` live in that file).

A bucket is a standing property of a grouping tier ("this series *is* 2 Seasons"), not of the plan row, and it must vary per media type because one franchise can hold anime and TV shows. So each of `franchise` and `series` carries two JSONB maps keyed by media type:

| Column | Written by | Example |
| --- | --- | --- |
| `size_group_derived` | Calculate (`derive_size_groups`), rewritten every run | `{"anime": "24ep", "tv-show": "1season"}` |
| `size_group_manual` | Admin only (Modify tab); Calculate never reads or writes it | `{"anime": "12ep"}` |

Effective bucket = `manual[media_type]` if present, else `derived[media_type]` (`effective_bucket`). Two maps instead of one map plus an "overridden" flag means Calculate can never stomp an edit and clearing an override is just deleting a key.

Entries have no stored bucket. `entry_bucket` resolves it at display time: comic buckets on its own `issue_total`; every other type inherits its series' effective bucket, then its franchise's.

Both Sheets parsers (`parse_franchise_from_sheet`, `parse_series_from_sheet` in `app/utils/formatter.py`) must carry both JSONB keys via `_safe_json`, and `app/schemas/franchise.py` exposes both fields on the Franchise and Series schemas; the derived one is Calculate-owned and the API does not write it back.

## Rules

### Allowed scopes

`ALLOWED_SCOPES` in `app/utils/plan_next_kinds.py`, keyed by kind then media type. Module-level asserts guarantee every media type in `MEDIA_TYPE_KEYS` appears under every kind. `scope_allowed(kind, media_type, scope)` is the check the API uses.

| Media type | `next` | `rewatch` |
| --- | --- | --- |
| anime | entry, series, franchise | franchise |
| movie | entry, series, franchise | entry, series, franchise |
| tv-show | entry, series, franchise | entry, series, franchise |
| cartoon | entry, series, franchise | franchise |
| comic | entry, series | entry, series |
| anime-movie | entry | entry |
| manga | entry | entry |
| novel | entry | entry, series, franchise |

The two maps differ on purpose: anime is queued one season at a time but rewatched as a whole franchise; novels are reread at any tier but queued one book at a time; comic has no franchise scope at all.

### Size thresholds and measures

`SIZE_THRESHOLDS` and `SIZE_MEASURE` in `app/utils/plan_next_kinds.py`; `bucket_for` in `app/services/domain/size_group.py` reads the bands in order and returns the first whose upper bound the measure does not exceed (`None` bound = open-ended last band). A missing or zero measure yields no bucket.

| Media type | Measure | Bucket keys (upper bound → key) | Labels |
| --- | --- | --- | --- |
| anime | `sum_ep_total` over the group's anime entries | ≤12 → `12ep`, ≤24 → `24ep`, else `30ep_plus` | 12 EP / 24 EP / 30+ EP |
| tv-show | count of entries | ≤1 → `1season`, ≤2 → `2season`, else `3season_plus` | 1 Season / 2 Seasons / 3+ Seasons |
| cartoon | count of entries | same as tv-show | same |
| movie | count of entries | ≤1 → `standalone`, ≤3 → `2_3movies`, else `4movies_plus` | Standalone / 2-3 Movies / 4+ Movies |
| comic | `sum_issue_total` (series only) | ≤3 → `1_3`, ≤10 → `4_10`, else `11_plus` | 1-3 Issues / 4-10 Issues / 11+ Issues |
| anime-movie, manga, novel | none | no bucket vocabulary on the backend | see UI section for their frontend-only groupings |

Note that anime's `24ep` band covers 13-24 episodes and `30ep_plus` is really "25+"; the labels are round names, not exact bounds. Comic thresholds were chosen from real data, to split the collection into three roughly equal bands across `1-3` / `4-10` / `11+`.

### Calculate derivation

`derive_size_groups(db)` in `app/services/domain/plan_next.py`, called from `app/services/calculation.py`. For every franchise and series it rebuilds the full derived map from the five bucketed types (`_DERIVABLE`), skipping comic at franchise tier (`_SERIES_ONLY`), and writes `size_group_derived` only when it changed. It never touches `size_group_manual`.

### Virtual entry flags

Owner: `PLAN_FLAG_FIELDS` in `app/utils/plan_next_kinds.py` (the map) and `pop_plan_flag` / `attach_plan_flag` / `set_entry_flag` / `planned_entry_ids` in `app/services/domain/plan_next.py`, wired through `app/routers/_factory.py`.

The entry Pydantic schemas still expose boolean flags so Add/Modify forms, detail pages and library filters work unchanged, but no entry table has such a column any more. Each flag is an entry-scope `plan_next` row of one kind:

| Media type | `next` flag | `rewatch` flag |
| --- | --- | --- |
| anime | `watch_next` | none (anime rewatches only at franchise scope; it never had one) |
| anime-movie | `watch_next` | `to_rewatch` |
| movie | `watch_next` | `to_rewatch` |
| tv-show | `watch_next` | `to_rewatch` |
| cartoon | `watch_next` | none (dropped; cartoon rewatches at franchise scope) |
| manga | `read_next` | `to_reread` |
| novel | `read_next` | `to_reread` |
| comic | `read_next` | `to_reread` |

An assertion in `plan_next_kinds.py` enforces that a type has an entry-level rewatch flag if and only if `entry` is in its `rewatch` scopes.

How the factory uses them (`app/routers/_factory.py`):

- List: `planned_entry_ids` per flag, one query per kind, then `setattr` on each entry.
- Get one: `attach_plan_flag` sets every flag as a plain instance attribute before serialization.
- Create / Update: `pop_plan_flag` splits the flags out of the payload; only fields actually present are returned, so a PATCH that omits a flag leaves its row alone, one that sends `false` deletes it. `set_entry_flag` then upserts or deletes the row.
- Delete: `delete_plans_for(db, "entry", entry.system_id)`.

### Group and entry deletes

The database does it. `delete_plans_for` no longer exists and no delete path calls anything:

| Deleting | What removes the plan rows |
| --- | --- |
| a franchise (`app/routers/franchise.py`) | `fk_plan_next_franchise` `ON DELETE CASCADE` |
| a series (`app/routers/series.py`) | `fk_plan_next_series` `ON DELETE CASCADE` |
| an entry (`app/routers/_factory.py`) | the entry's `AFTER DELETE` trigger removes its `media` row, and `fk_plan_next_media_type` cascades from that |
| a user | `fk_plan_next_user` `ON DELETE CASCADE` |

## API

Router: `app/routers/plan_next.py`, prefix `/api/plan-next`, registered in `app/main.py`. Schemas in `app/schemas/plan_next.py`. **Every route is gated on `self.list` at the router** (401 otherwise) and reads or writes only the caller's own rows; the routes also take `get_current_user_id` for the id they scope on. There is no additional admin gate on the writes — and an administrative account, holding no `self.*` grant, is refused like anyone else. The wire format is unchanged: `PlanNextRead` still carries `scope` and `target_id`, and `PlanNextCreate` still accepts them.

| Method | Path | Auth | Input | Response | Errors |
| --- | --- | --- | --- | --- | --- |
| GET | `/api/plan-next/kinds` | account | none | `{scopes, kinds, allowed_scopes: {kind: {media_type: [scopes]}}, size_groups: {media_type: [{key, label}]}}` | none |
| GET | `/api/plan-next/` | account | query `media_type?`, `scope?`, `kind?` (all optional filters) | `PlanNextRead[]`, the caller's own | `400` unknown scope |
| POST | `/api/plan-next/` | admin | body `PlanNextCreate`: `media_type`, `scope`, `target_id`, `remark?`, `kind` (defaults to `"next"`) | `201` + `PlanNextRead` | `422` unknown kind; `400` unknown scope or scope not allowed for that type/kind; `404` target does not exist; `409` already planned |
| DELETE | `/api/plan-next/target` | admin | **query params only**: `scope`, `media_type`, `target_id` (required), `kind` (default `next`) | `{"status": "success"}` | `404` "Not planned." |
| DELETE | `/api/plan-next/{system_id}` | admin | path id | `{"status": "success"}` | `404` "Plan not found." |

Notes:

- `DELETE /target` exists so a toggle needs one call without knowing the row id. It is declared before `/{system_id}` so the literal path wins.
- Both deletes call `log_deleted_record(db, row, "Plan Next")` from `app/utils/data_control_utils.py`.
- `GET /` runs `drop_hidden_rows` (`app/services/rbac/enforcement.py`) on entry-scope rows only; group-scope rows are always returned.
- `PlanNextRead` adds resolved display data: `missing` (default `True`; set `False` only when the target row is found), `display_name`, `label`, `is_tier`, `cover_image_file`, `nav_path`, and `expectation` (whichever of `franchise_expectation`, `series_expectation`, `expectation` the target carries, so the browser can sort without knowing the tier). Franchise and series carry no `cover_image_file`, so the frontend resolves their covers itself.
- Nothing here derives plans automatically; every row is curated from the admin forms, the franchise/series pages, or the entry flags. `GET /kinds` is documented and public but nothing in the frontend calls it (see UI).

## UI

### Plan page

Route `/plan` in `frontend/src/App.jsx`; nav entry under the "Track" section in `frontend/src/config/navigation.js`. Page shell `frontend/src/pages/public/Plan.jsx` renders three sections from `frontend/src/pages/plan/`:

| Section | File | Source of rows |
| --- | --- | --- |
| Watch Next | `PlanWatchNext.jsx` | `planRows` where `kind === "next"`, 8 tabs from `PLAN_TABS` |
| To Rewatch | `PlanToRewatch.jsx` | `planRows` where `kind === "rewatch"`, tabs from `REWATCH_TABS` |
| Future Releases | `PlanToWatchFuture.jsx` | unreleased entries, not `plan_next` (pre-existing feature) |

`usePlanData.js` fetches every media list plus `GET /api/plan-next/` (own React Query key `["plan-next"]`, kept separate from `["media-list", *]` so the list-cache writers never touch it) and attaches `bucket` and, for group rows, `coverUrl` to each plan row via `withBucket`. Cards render through `PlanNextCard.jsx`.

Within a tab, rows are grouped by bucket (`groupByBucket` in `frontend/src/utils/planNext.js`: every vocabulary bucket always renders, even empty, plus a trailing ungrouped pile) and sorted by `EXPECTATION_WEIGHT = { Highest: 0, High: 1, Medium: 2, Low: 3 }` (unknown → 99) using the `expectation` the API resolved.

### Frontend vocabulary copies (keep in sync by hand)

| Frontend file | Mirrors | What it holds |
| --- | --- | --- |
| `frontend/src/config/planNextGroups.js` | `ALLOWED_SCOPES`, `KINDS`, `SIZE_GROUPS` in `app/utils/plan_next_kinds.py` | `SIZE_GROUPS`, `KINDS`, `ALLOWED_SCOPES`, `scopesFor`, `PLAN_TABS`, `REWATCH_TABS`, `SCOPE_LABELS`, `UNGROUPED_LABELS` |
| `frontend/src/utils/planNext.js` | `app/services/domain/size_group.py`; `COMIC_BANDS` mirrors the comic row of `SIZE_THRESHOLDS` | `effectiveBucket`, `entryBucket`, `groupByBucket` |

There is no runtime guard; `GET /api/plan-next/kinds` is unused by the frontend so the page renders without a vocabulary round-trip. `frontend/src/utils/planNext.test.js` has a table-driven test that guards the two copies. When either side changes, update both and re-run the tests.

The frontend also carries two groupings the backend does not: manga tabs group by the entry's `serialization_status` (完結 / 連載中 / 腰斬 / 停更, empties under "其他") and novel tabs by the entry's `type` (Web Novel / Light Novel / Novel / Other). These are categorical self-groupings, never derived by Calculate, and live only in `planNextGroups.js` (`SELF_GROUP_COLUMN` in `usePlanData.js` picks the column). Anime-movie has an empty vocabulary and renders one ungrouped list.

### PlanKindToggles

`frontend/src/components/plan/PlanKindToggles.jsx` is the shared per-media-type checkbox control used by `FranchisePage.jsx`, `SeriesPage.jsx`, `FranchiseModifyTab.jsx`, and `SeriesModifyTab.jsx` (all under `frontend/src/pages/`). It takes `kind`, `scope`, and the media types the group actually holds, filters to those `scopesFor(kind, type)` allows, and renders nothing when none apply. `kindLabel` returns "Watch/Read Next" for `next`; for `rewatch` it returns **"To Reread"** when every applicable type is manga, novel, or comic, else "To Rewatch". Toggling calls `POST /api/plan-next/` or `DELETE /api/plan-next/target`.

## Sheets

The "Plan Next" tab is registered in `SHEET_TABS` in `app/services/pipelines/tabs.py`, after the group and entry tabs and Media Relation, because its FK-less targets must already exist on restore.

| Direction | Mechanism | File |
| --- | --- | --- |
| Backup | Header row is `PlanNext.__table__.columns`, so `kind` is written as a column alongside `media_type`, `scope`, `target_id`, `remark`, timestamps. | `app/services/pipelines/backup.py`, `app/utils/formatter.py` (`format_for_sheet`) |
| Pull | `parse_plan_next_from_sheet` preserves `media_type` and `scope` as written (no coercion, so a newer vocabulary survives an older app), turns an unparseable `target_id` into `None` (row shows as missing rather than failing the Pull), and sets `kind` to `parse_from_sheet(...) or "next"`. Pull then keeps only keys the sheet header carried, which is why the model's `server_default` is needed for pre-`kind` backups. | `app/utils/formatter.py`, `app/services/pipelines/pull.py` |
| Stale boolean columns | Old backups of entry, franchise and series tabs still carry `watch_next`, `read_next`, `to_rewatch`, `to_reread`, `watch_next_group` headers. The parsers no longer emit those keys, so the header-intersection step in `pull.py` silently drops them; the flags are not restored from those columns. | `app/services/pipelines/pull.py` |
| Size groups | Franchise and Series parsers read `size_group_derived` and `size_group_manual` through `_safe_json`. | `app/utils/formatter.py` |

Backfill: migration `9b0bcb763e8c` converted the old booleans into rows once. Entry-level `to_rewatch`/`to_reread` became entry-scope `rewatch` rows (cartoon entries deliberately excluded). Group-level `to_rewatch` on franchise and series became one group-scope `rewatch` row per media type the group actually holds, with the types derived from the child entry tables rather than from `franchise_type`, because that column is multi-valued, bundles types (ACG implies anime, manga and novel), and carries a legacy "Anime" value.

History in one line: migration `b872c435410b` dropped `watch_next`/`read_next` from the entry tables and `franchise.watch_next_group`; migration `9b0bcb763e8c` dropped the nine `to_rewatch`/`to_reread` booleans (franchise, series, anime_movies, movies, tv_shows, cartoons, manga, novel, comic), leaving `plan_next` as the only place a plan is stored.

## Related

- `app/utils/media_resolver.py`: `MEDIA_TABLES`, `MEDIA_TYPE_KEYS`, `OWNER_TABLES` (the read-time resolver and the source of media type keys).
- `app/utils/relation_kinds.py`: the registry `plan_next_kinds.py` is modelled on.
- `app/services/domain/remark_field.py`: `pop_remark`, the pattern `pop_plan_flag` copies.
- `app/services/calculation.py`: where `derive_size_groups` runs in the Calculate pipeline.
- `notes/decisions.md`: the design spec, including the comic threshold data and the rewatch migration decisions.
- `../data-model.md`, `docs/api.md`, `docs/options.md`, `../frontend/pages.md`: older overviews that may still describe the boolean columns; this file is the current reference.
