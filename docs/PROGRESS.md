# Progress

Status only. No prose, no summaries - one line per task, edited in place.

Status values: `todo` - `wip <who>` - `done <sha>` - `blocked <one clause>` - `skipped <one clause>`
`<who>` is a session or agent label, so two sessions never claim the same task.

A finished plan's table is deleted from here; `docs/roadmap.md` keeps the record.

Last updated: 2026-09-06

---

## In flight

### Cover storage layout: subdirectories under `static/covers/`

Owner-typed folders (`covers/<owner-type>/<system_id>.jpg`) replace the flat
directory; `cover_image_file` / `photo_file` store the full key.

| # | Task | Status |
|---|---|---|
| 1 | `image_manager`: `cover_key` + `owner_type` args (local + GCS) + unit tests | done (uncommitted) |
| 2 | Callers: `autofill.py` x12, `_factory.py`, `publisher.py`, `main.py` folder creation | done (uncommitted) |
| 3 | `calculation.py`: owner-qualified `set-cover-image-fields`; orphan scan skips non-media owners (bug fix + regression test) | done (uncommitted) |
| 4 | `covers.js` convention fallbacks use `media_type`; Add-tab hints (+ `withMediaType` tagging in 4 callers); frontend tests | done (uncommitted) |
| 5 | `scripts/migrate_cover_layout.py` (dry-run default, idempotent, `--gcs`) + tests | done (uncommitted) |
| 6 | Run the migration locally; verify covers on :5173 and :8000 | done (uncommitted) - 1884 files moved, 1884 columns rewritten; 59 orphans and 5 file-less rows left alone |
| 7 | Docs: `data-actions`, `deployment-gcp`, `switching-environments`, `external-apis`, `architecture`, `api`, `setup-local`, `frontend/components` | done (uncommitted) |

## Open items

Unclaimed. None block using the app.

| Item | Where | Status |
|---|---|---|
| Backup not yet run since the cover-folder migration - the sheet still holds flat filenames | `/system` -> Backup, before the other machine pulls | todo |
| The API test suite writes 2 real studio logos into the working `static/covers/studio/` | a fill test reaching the network | todo |
| `alembic upgrade head` from an EMPTY db fails at `86982d71c2f1` | pre-existing; blocks a from-scratch deploy | todo |
| Startup dies when stdout is not UTF-8 - emoji prints, and the error handler itself throws, hiding the real cause | `app/main.py` 108/118/123/129 | todo |
| `delete_studio` never calls `delete_cover_image` (logo leak; publisher does) | `app/routers/studio.py` | todo |
| Migrate `publisher_tw` tag rows into the publisher entity | anime, manga, novel, comic | todo |
| Steam Web API playtime sync | `steam_appid`/`steam_link` reserved | todo |
| `bulk_download_missing_covers` has no Game branch | `app/services/calculation.py` | todo |
| Games (and comics) absent from cover lists | `FranchiseLibrary`, `CollectionLibrary`, `CollectionPage`, `usePlanData` | todo |
| No Games tab | `FutureReleases.jsx` | todo |
| Colour-token table holds pre-archive hexes | `docs/frontend/components.md` | todo |
| Stale comment: "Fill reads igdb_id, which the backend derives from this link" | `frontend/src/config/formFields/fieldMeta.js:890` | todo |
| `/defaults` shows an inert auto-fill column for Game | `frontend/src/config/formFields/fieldMeta.js` | todo |

## Environment

| | |
|---|---|
| Dev db | at `g1a2m3e4s5` (re-run 2026-09-06 after the revision was edited in place for the game platform tag + reference vocabulary). The one `games` row was dumped and restored; the superseded option rows the downgrade could no longer name (`Reference Source` Bahamut/Official/Wiki/Fandom, `Platform` Game Pass/PlayStation Plus/GeForce Now/Browser - all game-scoped and unreferenced) were deleted by hand |
| Pre-migration dump | `~/anime_site_pre_games_20260906_134907.sql` |
| `.env` gap | `IGDB_CLIENT_ID` / `IGDB_CLIENT_SECRET` unset - IGDB Fill is a logged no-op until set |
| Droppable test dbs | `anime_site_test_covers` `anime_site_test_pubbe` `anime_site_test_gameb` `anime_site_test_gamec` `anime_site_test_igdb` `anime_site_test_gamefix` `anime_site_test_gameplat` |
