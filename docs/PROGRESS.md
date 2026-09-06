# Progress

Status only. No prose, no summaries - one line per task, edited in place.

Status values: `todo` - `wip <who>` - `done <sha>` - `blocked <one clause>` - `skipped <one clause>`
`<who>` is a session or agent label, so two sessions never claim the same task.

A finished plan's table is deleted from here; `docs/roadmap.md` keeps the record.

Last updated: 2026-09-06

---

## In flight

Nothing.

## Open items

Unclaimed. None block using the app.

| Item | Where | Status |
|---|---|---|
| `alembic upgrade head` from an EMPTY db fails at `86982d71c2f1` | pre-existing; blocks a from-scratch deploy | todo |
| Startup dies when stdout is not UTF-8 - emoji prints, and the error handler itself throws, hiding the real cause | `app/main.py` 108/118/123/129 | todo |
| `delete_studio` never calls `delete_cover_image` (logo leak; publisher does) | `app/routers/studio.py` | todo |
| Migrate `publisher_tw` tag rows into the publisher entity | anime, manga, novel, comic | todo |
| Steam Web API playtime sync | `steam_appid`/`steam_link` reserved | todo |
| `bulk_download_missing_covers` has no Game branch | `app/services/calculation.py` | todo |
| Games (and comics) absent from cover lists | `FranchiseLibrary`, `CollectionLibrary`, `CollectionPage`, `usePlanData` | todo |
| No Games tab | `FutureReleases.jsx` | todo |
| Colour-token table holds pre-archive hexes | `docs/frontend/components.md` | todo |
| Stale comment: "Fill reads igdb_id, which the backend derives from this link" | `frontend/src/config/formFields/fieldMeta.js:881` | todo |
| `/defaults` shows an inert auto-fill column for Game | `frontend/src/config/formFields/fieldMeta.js` | todo |

## Environment

| | |
|---|---|
| Dev db | migrated to `g1a2m3e4s5` on 2026-09-06 |
| Pre-migration dump | `~/anime_site_pre_games_20260906_134907.sql` |
| `.env` gap | `IGDB_CLIENT_ID` / `IGDB_CLIENT_SECRET` unset - IGDB Fill is a logged no-op until set |
| Droppable test dbs | `anime_site_test_pubbe` `anime_site_test_gameb` `anime_site_test_gamec` `anime_site_test_igdb` `anime_site_test_gamefix` |
