# Progress

Status only. No prose, no summaries - one line per task, edited in place.

Status values: `todo` - `wip <who>` - `done <sha>` - `blocked <one clause>` - `skipped <one clause>`
`<who>` is a session or agent label, so two sessions never claim the same task.

A finished plan's table is deleted from here; `docs/roadmap.md` keeps the record.

Last updated: 2026-09-07

---

## In flight

### Publisher / Distributor entity migration — DONE

Shipped 2026-09-07 in `22ef2ac`, `1900266`, `68f0f00`, `bdcb1ef`, `e2a7dcb`.
All 12 tasks done; `docs/roadmap.md` keeps the record and this section goes at
the next tidy-up. Kept here only for the two operational notes below.

**Migration RUN on `anime_site_db`**, now at `pb2m3i4g5r8`: 520 credits, 32
entities, 36 scopes, 0 skipped. Verified after: 0 tag rows and 0 option rows
left in the two retired categories, 32 publishers, 522 publisher credits
(520 + the 2 pre-existing game ones). Pre-migration dump at
`~/anime_site_pre_publisher_20260907.sql`.

**⚠ BACKUP STILL OWED — the one thing left for a human.** The Google Sheet is
still a pre-migration copy. Two hazards until Backup runs from `/system`:

1. `Proware普威爾` and `曼迪 Mightymedia` keep their pre-migration spelling in
   no name column, so a Pull from the current sheet cannot match them and
   would mint duplicate publishers (spec Decision E).
2. The sheet has no `Publisher Scope` tab yet, so a Pull would restore
   nothing for it. Harmless now - Backup creates the tab.

Do the Backup before the other machine pulls anything, per
`docs/switching-environments.md`.

### public_id + slug URLs

Plan `docs/superpowers/plans/2026-09-07-public-id-slug-urls.md`,
spec `docs/superpowers/specs/2026-09-07-public-id-slug-urls-design.md`.

| # | Task | Status |
|---|---|---|
| 1 | `public_id` column on all seventeen models + migration | done 761f4e4 |
| 2 | Shared entity-reference resolver | todo |
| 3 | Frontend slug and path helpers | todo |
| 4 | `public_id` on the response schemas | todo |
| 5 | Media router factory resolves a public_id | todo |
| 6 | The eight hand-written routers resolve a public_id | todo |
| 7 | `public_id` survives the Sheets round trip | done 62f19f1 |
| 8 | Pull advances each sequence past the restored ids | todo |
| 9 | Routes and detail pages read `publicId` | todo |
| 10 | Every link site goes through `entityPath` | todo |
| 11 | Documentation | todo |

⚠ Tasks 9-10 break every detail-page URL until both land. Do not use the app
between the start of task 9 and the end of task 10.

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
