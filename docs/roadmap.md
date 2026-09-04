# Roadmap

Last verified: 2026-09-04 (commit c80c84a)

## What this is for

This file replaces `roadmap.md`. It is the one place that answers three questions: what has already shipped (so nobody re-plans it), what is being worked on right now, and what was consciously left undone. The "Done" log is one line per feature, newest first, distilled from the git history and the retired plan. "Next" is empty on purpose until a piece of work is picked up. "Deferred / known debt" lists things the code still does the awkward way; each line was checked against the source on the verification date, so if a line is stale the code moved and the line should go.

The rule from `CLAUDE.md` still applies: when implementing from this file, pause and ask for permission after each step or set of steps, record progress in the "Next" section only, and do not rewrite the plan itself.

## Done

Newest first. Dates are the commit dates; specs and plans that drove a feature lived under `docs/superpowers/` and are summarised in [notes/decisions.md](notes/decisions.md).

| When | Feature |
|---|---|
| 2026-09-04 | Novel units and two-stage progress: `novel_unit` child table (volume/arc/story/chapter, `unit_key`/names/remark/`ch_count`) replacing the two parallel `novel_name_each_cn`/`_en` JSONB lists; `ch_fin_in_arc` added so `arc_fin`/`ch_fin_in_arc` form a two-stage reading cursor derived from arc rows on every write, with volume rows staying non-authoritative enrichment (Decision B); `MediaTypeSpec.nested_collections`/`progress_hook` generalise the router factory for a `units` payload key; `NovelUnitsEditor` replaces `BelongingNovelsEditor`; `progress_display` narrowed to the JP/KR-vs-TW volumes choice with legacy values still rendering; a `novelUnitKinds.test.js` drift guard pins the frontend kind map to `app/utils/constants.py` |
| 2026-09-04 | Person as a public entity: one role vocabulary of five (director, producer, composer, author, illustrator) replacing the two lists, media-type-scoped and NOT NULL on `person_role`, with 原作 / Author / Writer derived from `(role, media_type)`; `person` reshaped to four optional names with a data-driven display choice; `credit_refs` with ids and labels on every media payload; `GET /api/person/{id}/entries` and a `?credits=N`-guarded delete; Entity → Person Add/Modify/Delete with a role × scope matrix; `/library/person` and `/person/:system_id`, linked from every credit row on the six detail pages |
| 2026-09-04 | Studio as a public entity: `studio` reshaped to four optional names with a data-driven display choice and a profile (country, founded/defunct, website, MAL, logo); `GET /api/studio/{id}/entries`; `studio_refs` on anime and anime-movie payloads; `/library/studio` and `/studio/:system_id` pages, linked from the Studio row on both detail pages; studio Add/Modify/Delete moved into a new Entity admin group |
| 2026-08-30 | Dark mode across the app: semantic colour tokens, `ThemeProvider`, Nav toggle, ReactFlow `colorMode`, a token guard test |
| 2026-08-30 | Route-level code splitting for admin, statistics, plan and relations pages |
| 2026-08-30 | One `Library` page on `/library/:type` with shared columns and sorts |
| 2026-08-30 | Router factory serves anime and anime movie; data-control routes generated from the pipeline registry |
| 2026-08-30 | One franchise/series resolver, one union-find (`app/utils/clustering.cluster`) behind every duplicate finder, one Fill/Replace runner driven by per-type specs, one sheet-tab registry for Backup and Pull |
| 2026-08-30 | Fixes: PATCH column whitelist, labelled entries hidden from the relations graph, write-hook failures no longer 500, single QueryClient, picker selection, Delete page limits and cross-type cascade, hub load races, valid Pull defaults for Anime, truthful enrichment reporting |
| 2026-08-30 | Build hygiene: pinned requirements, Python 3.13 in image and CI, ruff/eslint/editorconfig, CI test gate, committed DB password dropped |
| 2026-08-30 | Security fixes: SPA path traversal, Backup tab wipe, Fill eligibility, Anime Movie tab, guest-admin grant (409), `pull/{tab}` 400 |
| 2026-08-29 | Search moved from the browser to `/api/search` |
| 2026-08-29 | View-authorization RBAC: roles, permissions, content labels, SQL-level visibility, field gating — see [authorization.md](authorization.md) |
| 2026-08-29 | 標籤 Label tag field with its first three seeded values |
| 2026-08-29 | Read-only System Options admin page grouped by the three tiers |
| 2026-08-29 | Options redesign: `system_option` reshaped with UUID keys, uniqueness and explicit scopes; Tier 1 enums served from `/api/constants`; option scopes editable |
| 2026-08-29 | Credits and tags: `person`, `person_role`, `studio`, `media_credit`, `media_tag` tables; backfill from the legacy comma-joined columns then those columns dropped; name normalisation and spelling-variant duplicate check; person and studio routers with merge; `/api/credits` per entry; fetched names resolved to rows; sheet columns kept while links back up to their own tabs |
| 2026-08-29 | Rewatch levels: `plan_next.kind` with a server default, nine `to_rewatch`/`to_reread` booleans dropped, per-type toggles on franchise and series forms, To Rewatch page rendered per scope, comic reread toggle |
| 2026-08-29 | Plan next: one `plan_next` table replaces `watch_next`/`read_next`/`watch_next_group`; size buckets derived during Calculate with manual override; Plan page rewritten with a comic tab; manga grouped by serialization status and novel by type |
| 2026-08-28 | Completed (解說) watch/read status; Canceled/Rumored airing status |
| 2026-08-28 | Exact MAL air date stored for anime and anime movies |
| 2026-08-28 | Release dates migrated to truncated ISO-8601 with CHECK constraints, one helper module, partial-precision admin input, Sheets text round-trip, TW-first priority for movies |
| 2026-08-28 | Watch order sections (parts) with entries wrapped by their part; Krakoan x A.X.E. and Combined Core reading orders seeded on the Marvel Comics franchise |
| 2026-08-28 | Comic feature parity: search, hierarchy pages, statistics, meme/quote pickers, duplicate detection, remarks, review queue, admin tabs; issue ranges in watch orders |
| 2026-08-27 | Relations canvas refinements: Corresponding kind, closed peer chains, fullscreen toggle, cluster spacing, form under the canvas, Reset per scope, direction swap, setting kind, lanes and fans, undo, read-only graph tab on every hub, type filter |
| 2026-08-27 | Notes: insert music folded into `insert_songs`, music tracked as note rows, empty sections/groups/card collapsed by default, remark rendered inside the notes card |
| 2026-08-27 | Nav rebuilt as a two-row catalog drawer |
| 2026-08-26 | Comic entry type: table, Add/Modify/Delete tabs, detail page, library page, franchise/series/3x3 tabs, Comic Vine enrichment (`comicvine_id`/`comicvine_link`, autofill, cover download, search endpoint) |
| 2026-08-26 | Sheets client: retry transient 5xx, stop reading an outage as an empty tab, read the API error status off the response |
| 2026-08-25 | Tenrai v1 replaces Jikan v4 for MAL metadata, with 4/sec and 120/min rate limits |
| 2026-08-25 | Per-entry `watch_order` column and its derivation dropped |
| 2026-08-25 | Relations graph on `@xyflow/react` + dagre with a dedicated `/graph` endpoint |
| 2026-08-23 | Remark column collapsed into the `remark` note section |
| 2026-08-23 | Notes restructure: one polymorphic `note` table and a backend section registry replace the notes JSONB |
| 2026-08-23 | Media relations: one polymorphic `media_relation` table replaces prequel/sequel/alternative/derive_related |
| 2026-08-23 | Series hub with expanded columns, cover entry, tabs and its own notes |
| 2026-05-14 | Plan page: Watch Next / To Rewatch moved off Statistics |
| 2026-05-08 | Dedicated `POST /{id}/complete` per router |
| earlier | Collection tier; watch order lists/items/auto source/importance; quotes and memes; announcements; seasonal page; is_most_recommended; anime broadcast schedule; the seven original media types (anime, anime movie, movie, TV show, cartoon, manga, novel); Google Sheets backup/pull; TMDB/OMDb autofill; GCS covers; JWT admin login |

## Next

Nothing in progress. Pick the next piece of work from "Deferred / known debt"
below, or start a new spec under `docs/superpowers/specs/`.

## Deferred / known debt

Each line was verified against the code at the commit above.

| Area | Debt | Where it shows |
|---|---|---|
| Frontend | Per-type detail pages are still hand-written (27 files); a descriptor-driven `MediaDetailPage` is planned but not started | `frontend/src/pages/detail/*.jsx` |
| Frontend | `StatsCompletions.jsx` is ~1,400 lines of eight near-identical per-type blocks | `frontend/src/pages/statistics/StatsCompletions.jsx` |
| Backend | The watch-order router holds domain logic (1,480 lines vs 421 in the domain module) | `app/routers/watch_order.py`, `app/services/domain/watch_order.py` |
| Backend | Autofill wraps each fetch in a bare `except Exception`, so tenacity's `RetryError` is swallowed and reported as a generic failure | `app/services/domain/autofill.py` |
| Backend | Tenrai and Comic Vine rate limiters are in-memory sliding windows; a second instance would double the budget | `app/services/integrations/tenrai.py`, `comicvine.py` |
| Data model | `character` / `character_voice` tables deferred | noted in `data-model.md` |
| Backend | Novel progress columns are `float` in the schema without validators (`vol_fin`, `ch_fin`, `ch_fin_in_arc`, `arc_*`, `vol_total_*`) | `app/schemas/novel.py` |
| Tooling | `ruff check` runs in CI but `ruff format` has never been applied to the tree | `.github/workflows/deploy.yml` |
| Backend | No `/api/health` endpoint | `app/main.py` |
| Backend | RBAC permission cache is a process-local dict; correct only while Cloud Run runs one instance | `app/services/rbac/cache.py` |
| Frontend | `react-hooks/set-state-in-effect` is downgraded to a warning and several files still trip it | `frontend/eslint.config.js` |
| Frontend | Dark mode is tokenised and guarded by a test but not yet visually verified page by page | theme commits `70eb8f9`, `4339702` |
| Frontend | The Nav mobile panel still uses `slate-*` utilities instead of theme tokens | `frontend/src/components/layout/Nav.jsx` (also `NavSearch.jsx`, `MediaCard.jsx`) |
| Frontend | `FranchiseLibrary` filters on anime and manga sets only; comics are not a filter category | `frontend/src/pages/library/FranchiseLibrary.jsx` |
