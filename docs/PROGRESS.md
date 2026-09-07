# Progress

Status only. No prose, no summaries - one line per task, edited in place.

Status values: `todo` - `wip <who>` - `done <sha>` - `blocked <one clause>` - `skipped <one clause>`
`<who>` is a session or agent label, so two sessions never claim the same task.

A finished plan's table is deleted from here; `docs/roadmap.md` keeps the record.

Last updated: 2026-09-06

---

## In flight

### Steam integration: prices, Metacritic and personal progress for games

Two sources for `game` now, not one: IGDB still fills the catalogue facts and
supplies the Steam appid; Steam fills live prices, the Metacritic score, the
achievement total and (with credentials) this collection's own playtime and
achievements earned. Game gained its first bulk Replace. Spec:
`docs/superpowers/specs/2026-09-06-steam-integration-design.md`.

| # | Task | Status |
|---|---|---|
| 1 | `extract_steam_appid` | done (uncommitted) |
| 2 | IGDB returns the appid (`external_games`) | done (uncommitted) |
| 3 | The appid reaches the database (`apply_extract_steam_appid`, `apply_extract_game_ids`) | done (uncommitted) |
| 4 | `steam_progress_sync` column | done (uncommitted) |
| 5 | The Steam client (`app/services/integrations/steam.py`) | done (uncommitted) |
| 6 | `map_steam_to_game_data` | done (uncommitted) |
| 7 | `autofill_game_from_steam` | done (uncommitted) |
| 8 | Pipeline wiring and the first game Replace | done (uncommitted) |
| 9 | The catalog and its drift guards | done (uncommitted) |
| 10 | The Replace button (frontend) | done (uncommitted, task review pending) |
| 11 | Documentation | done (uncommitted, task review pending) |

**Resume here.** Nothing is committed. Next, in order: (1) task review of 10
and 11; (2) the final whole-branch review; (3) commit. Tasks 1-9 each passed a
task review, several after a fix round.

Staging will need care: `frontend/src/lib/payloads.js`, `payloads.test.js`,
`config/formFactories.js` and `config/formFields/fieldMeta.js` hold BOTH this
work (`steam_progress_sync`) and another session's concurrent `steam_appid` /
`steam_link` form fields. Stage per hunk, not per file.

Gates as of the pause: ruff clean, frontend 825 passed, lint clean, `npm run
build` done. Dev db is at `gs1p2r3o4g5`.

Backend suite: 2960 passed / 1 skipped, re-confirmed on a quiet tree. An
earlier run reported 45 failed / 51 errors; that was interference from another
session editing the tree mid-run, not a regression - the failures were
fixture/setup errors and the sampled file passed in isolation. Treat any full
run taken while another session is editing as unreliable.

`external_games` probe: skipped deliberately (controller ruling) rather than
made live — both `category` (legacy enum) and `external_game_source` are
requested and either spelling is accepted, a safe superset that survives
IGDB's migration regardless of which is live today. `STEAM_API_KEY` /
`STEAM_ID` are now set on this machine and verified live (80 games, 53 with
playtime). Where they are unset the storefront half (prices, Metacritic,
achievement total) fills without them, and the two progress columns
(`hours_played`, `achievements_earned`) stay null until they are set.

## Open items

Unclaimed. None block using the app.

| Item | Where | Status |
|---|---|---|
| Backup not yet run since the cover-folder migration - the sheet still holds flat filenames | `/system` -> Backup, before the other machine pulls | todo |
| `alembic upgrade head` from an EMPTY db fails at `86982d71c2f1` | pre-existing; blocks a from-scratch deploy | todo |
| Startup dies when stdout is not UTF-8 - emoji prints, and the error handler itself throws, hiding the real cause | `app/main.py` 108/118/123/129 | todo |
| `delete_studio` never calls `delete_cover_image` (logo leak; publisher does) | `app/routers/studio.py` | todo |
| Migrate `publisher_tw` tag rows into the publisher entity | anime, manga, novel, comic | todo |
| Steam Web API playtime sync | `steam_appid`/`steam_link` reserved | done (uncommitted) - see "Steam integration" table above |
| Games absent from the three bulk cover actions (check/set-fields/download) | `app/services/calculation.py` | done d2b3a96 |
| Games (and comics) absent from cover lists | `FranchiseLibrary`, `CollectionLibrary`, `CollectionPage`, `usePlanData` | todo |
| No Games tab | `FutureReleases.jsx` | todo |
| Colour-token table holds pre-archive hexes | `docs/frontend/components.md` | todo |
| `/defaults` shows an inert auto-fill column for Game | `frontend/src/config/formFields/fieldMeta.js` | todo |

## Environment

| | |
|---|---|
| Dev db | at `gs1p2r3o4g5` (`steam_progress_sync`), which is head - the migration has been applied |
| Pre-migration dump | `~/anime_site_pre_games_20260906_134907.sql` |
| `.env` gap | none on this machine - `IGDB_CLIENT_ID` / `IGDB_CLIENT_SECRET` and `STEAM_API_KEY` / `STEAM_ID` are all set. Steam verified live 2026-09-07: 80 games owned, 53 with playtime. `.env` travels nowhere, so the other machine and Cloud Run still need the two Steam vars |
| Droppable test dbs | `anime_site_test_covers` `anime_site_test_pubbe` `anime_site_test_gameb` `anime_site_test_gamec` `anime_site_test_igdb` `anime_site_test_gamefix` `anime_site_test_gameplat` `anime_site_test_gameflags` `anime_site_test_fdgame` `anime_site_test_extapi` `anime_site_test_steam` |
