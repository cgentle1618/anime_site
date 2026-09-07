# Progress

Status only. No prose, no summaries - one line per task, edited in place.

Status values: `todo` - `wip <who>` - `done <sha>` - `blocked <one clause>` - `skipped <one clause>`
`<who>` is a session or agent label, so two sessions never claim the same task.

A finished plan's table is deleted from here; `docs/roadmap.md` keeps the record.

Last updated: 2026-09-07

---

## In flight

### Publisher / Distributor entity migration

Plan: `docs/superpowers/plans/2026-09-07-publisher-entity-migration.md`
Spec: `docs/superpowers/specs/2026-09-07-publisher-entity-migration-design.md`

| # | Task | Status |
|---|---|---|
| 1 | `publisher_scope` table + migration | done 22ef2ac |
| 2 | Scope plumbing — schema, resolver, router | done 22ef2ac |
| 3 | `PublisherRef` carries its label | done 22ef2ac |
| 4 | Widen the role, label it per media type | done 22ef2ac |
| 5 | One-time conversion (`backfill_publishers`) | done 22ef2ac |
| 6 | Retire the `publisher_tw` / `comic_publisher` tag fields | done 22ef2ac |
| 7 | Admin forms — entity picker and scope pills | done 1900266 |
| 8 | Detail pages read the backend's label | done 1900266 |
| 9 | Scoped suggestion fetch (`sources.js`) | done 68f0f00 |
| 10 | Documentation | wip pubmig-10 |
| 11 | Anime-movie publisher FORM field (gap found in Task 9) | done 68f0f00 |

**Settled 2026-09-07:** the three vocabulary values with zero tag rows —
`bilibili`, `Crunchyroll`, `bilibili (GoodShow)`. The owner wants **bilibili
and Crunchyroll seeded as entities**; `bilibili (GoodShow)` is **dropped**.
Final count 32 entities, not 30. Commit and the real migration are approved.

**Migration RUN on `anime_site_db` 2026-09-07**, now at `pb2m3i4g5r8`:
520 credits, 32 entities, 36 scopes, 0 skipped. Verified after: 0 tag rows and
0 option rows left in the two retired categories, 32 publishers, 522 publisher
credits (520 + the 2 pre-existing game ones). Pre-migration dump at
`~/anime_site_pre_publisher_20260907.sql`.

**Backup still owed.** The Google Sheet is a pre-migration copy, and
`Proware普威爾` / `曼迪 Mightymedia` cannot resolve from it (see the spec's
Decision E), so a Pull from it would mint duplicates. Run Backup from
`/system` once the frontend tasks land.

The coexistence window is CLOSED - Task 6 removed the duplicate Comic header.

## Open items

Unclaimed. None block using the app.

| Item | Where | Status |
|---|---|---|
| `alembic upgrade head` from an EMPTY db fails at `86982d71c2f1` | pre-existing; blocks a from-scratch deploy | todo |
| Startup dies when stdout is not UTF-8 - emoji prints, and the error handler itself throws, hiding the real cause | `app/main.py` 108/118/123/129 | todo |
| `delete_studio` never calls `delete_cover_image` (logo leak; publisher does) | `app/routers/studio.py` | todo |
| Anime-movie Director picker reads the `anime` scope, not `anime-movie` | `AnimeMovieAddTab.jsx:302`, `AnimeMovieModifyTab.jsx:233` pass `scope: "anime"` while `fieldMeta.js:374` declares `anime-movie`, so an anime movie's own directors never appear. Pre-dates the publisher work | todo |
| Games (and comics) absent from cover lists | `FranchiseLibrary`, `CollectionLibrary`, `CollectionPage`, `usePlanData` | todo |
| No Games tab | `FutureReleases.jsx` | todo |
| Colour-token table holds pre-archive hexes | `docs/frontend/components.md` | todo |
| `/defaults` shows an inert auto-fill column for Game | `frontend/src/config/formFields/fieldMeta.js` | todo |
| Invented entities do not reach the admin log table | `Admin.jsx` renders `error_message` only on Failed rows, never `details_json`; deferred while another session works in that file | todo |
| Entry tabs may still mint entities (create-on-miss) | `credits.resolve_*` is find-or-create for the Add form too; refusing from entry tabs is a policy call | todo |

## Environment

| | |
|---|---|
| Dev db | at `gs1p2r3o4g5` (`steam_progress_sync`), which is head - the migration has been applied |
| Pre-migration dump | `~/anime_site_pre_games_20260906_134907.sql` |
| Studio data | 45 duplicate studios removed by hand 2026-09-07; the delete cascaded ~377 credits away, rebuilt by Pull All from the entry tabs' `studio` columns. Now 78 studios, 483 studio credits, 0 duplicate clusters, and all 78 local ids match the sheet (28 were realigned to the sheet's ids after Pull matched them by name) |
| `.env` gap | none on this machine - `IGDB_CLIENT_ID` / `IGDB_CLIENT_SECRET` and `STEAM_API_KEY` / `STEAM_ID` are all set. Steam verified live 2026-09-07: 80 games owned, 53 with playtime. `.env` travels nowhere, so the other machine and Cloud Run still need the two Steam vars |
| Droppable test dbs | `anime_site_test_covers` `anime_site_test_pubbe` `anime_site_test_gameb` `anime_site_test_gamec` `anime_site_test_igdb` `anime_site_test_gamefix` `anime_site_test_gameplat` `anime_site_test_gameflags` `anime_site_test_fdgame` `anime_site_test_extapi` `anime_site_test_steam` |
