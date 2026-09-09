# Progress

Status only. No prose, no summaries - one line per task, edited in place.

Status values: `todo` - `wip <who>` - `done <sha>` - `blocked <one clause>` - `skipped <one clause>`
`<who>` is a session or agent label, so two sessions never claim the same task.

A finished plan's table is deleted from here; `docs/roadmap.md` keeps the record.

Last updated: 2026-09-09

---

## In flight

Step 0 - the `media` supertable - shipped 2026-09-09 (`159ab302`..`c7ccb5b3`);
`docs/roadmap.md` keeps the record and its table is deleted per the convention
above.

### Step 1 - `user_media_list` (`docs/superpowers/plans/2026-09-08-step1-user-media-list.md`)

Task 22 (the `User Media List` sheet tab) is executed EARLY, right after Task 4,
not last as the plan lists it: Task 9 starts dropping personal columns and
`format_model_for_sheet` derives a tab from its model, so a Backup taken between
Task 9 and Task 22 would write no ratings or progress at all. Step 0 hit the
same hazard and reordered for it.

| Task | Status |
|---|---|
| 1. `user_media_list` model and table | done |
| 2. `user_list` service (the vocabulary) | done |
| 3. Backfill to the admin user | done |
| 4. `Viewer.user_id` | done |
| 22. `User Media List` sheet tab (run early, before Task 9) | done |
| 5. `list_backed` and the read path | done |
| 6. The write path | done |
| 7. Completion services become per-user | done |
| 8. Seasonal counters stop reading `anime.watching_status` | done |
| 9. Flip `anime` | done |
| 10. Flip `anime_movies` | done |
| 11. Flip `movies` | done |
| 12. Flip `tv_shows` | todo |
| 13. Flip `cartoons` | todo |
| 14. Flip `manga` | todo |
| 15. Flip `novel` | todo |
| 16. Flip `comic` | todo |
| 17. Flip `games` | todo |
| 18. Remove the flag and the dead helpers | todo |
| 18. `game_copy.user_id` | todo |
| 19. `novel_unit.my_rating` | todo |
| 20. Pipelines stop writing personal fields | todo |
| 21. Personal columns leave the nine media parsers | todo |
| 23. Documentation | todo |
| 24. Definition of done | todo |

## Open items

Unclaimed. None block using the app.

| Item | Where | Status |
|---|---|---|
| `alembic upgrade head` from an EMPTY db fails at `86982d71c2f1` | pre-existing; blocks a from-scratch deploy | todo |
| Data migrations that import live ORM models break whenever a later migration adds a column | `pb2m3i4g5r8` (and the `86982d71c2f1` item above) call service functions that query `app.models`, which always SELECT every column the model declares. Reordering fixed the one instance that blocked the home machine on 2026-09-07; the class of defect stands, and the next column added to `publisher`, `media_credit`, `media_tag` or `system_option` re-breaks it. The durable fix is a frozen snapshot in the revision instead of the live models | todo |
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
| Dev db | **home machine**, now in the `anime_site_postgres_db` container (`postgres:17`) on `127.0.0.1:5432`, at `m1b1anime` (head), reached from `pdf1e2r3d4e5` on 2026-09-09 after the `m0c1source` fix below. Migrated off native PostgreSQL 17.6 on 2026-09-08 by dump and restore; all 43 non-empty tables verified row-for-row. The native 17 and 18 Windows services are stopped and set to Manual |
| Pre-Step-1 dump | `~/anime_site_home_pre_step1_20260909.sql` (3.2 MB, home, taken before the `m0a*`..`m1b1anime` run; that run deleted 2 orphaned `media_credit` and 10 orphaned `media_tag` rows, by design) |
| Pre-Docker dump | `~/anime_site_home_pre_docker_20260908.sql` (3.2 MB, taken from native 17.6 before the container migration) |
| Pre-migration dump | `~/anime_site_pre_games_20260906_134907.sql` (company) |
| Home dumps | `~/anime_site_home_pre_publisher_20260907.sql` (before the publisher backfill) and `~/anime_site_home_pre_pull_20260907.sql` (before Pull All) |
| Studio data | 45 duplicate studios removed by hand 2026-09-07; the delete cascaded ~377 credits away, rebuilt by Pull All from the entry tabs' `studio` columns. Now 78 studios, 483 studio credits, 0 duplicate clusters, and all 78 local ids match the sheet (28 were realigned to the sheet's ids after Pull matched them by name) |
| Pull All | run on home 2026-09-09 after the migration, all 40 tabs, 0 credit conflicts, 0 invented entities. Needed the `Game Copy` fix below first. Post-pull: 2081 `media` / `user_media_list`, 833 `anime`, 88 `game_copy`, 0 orphans |
| `Game Copy` identity | `game_copy` mints its uuid per database (the Steam import creates the rows), so the sheet's uuid always missed and the INSERT hit `uq_game_copy_row`, killing the whole Pull. Added to `DERIVED_IDENTITY_KEYS` on 2026-09-09 |
| `.env` gap | none on this machine - `IGDB_CLIENT_ID` / `IGDB_CLIENT_SECRET` and `STEAM_API_KEY` / `STEAM_ID` are all set. Steam verified live 2026-09-07: 80 games owned, 53 with playtime. `.env` travels nowhere, so the other machine and Cloud Run still need the two Steam vars |
| Droppable test dbs | The old list lived in the **native** server, which is now stopped — those databases are unreachable and effectively gone (the data directory is still on disk at `C:/Program Files/PostgreSQL/17/data` if anything is ever needed from it). The container currently holds `anime_site_test`, `anime_site_test_gcprm`, `anime_site_test_step0` and `anime_site_test_step1` / `_step1b` / `_step1c` / `_step1d` (created 2026-09-09; the b and c copies exist so parallel agents do not reset each other's schema mid-run); all are droppable |
