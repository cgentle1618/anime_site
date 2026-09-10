# Progress

Status only. No prose, no summaries - one line per task, edited in place.

Status values: `todo` - `wip <who>` - `done <sha>` - `blocked <one clause>` - `skipped <one clause>`
`<who>` is a session or agent label, so two sessions never claim the same task.

A finished plan's table is deleted from here; `docs/roadmap.md` keeps the record.

Last updated: 2026-09-10

---

## In flight

Step 0 - the `media` supertable - shipped 2026-09-09 (`159ab302`..`c7ccb5b3`);
`docs/roadmap.md` keeps the record and its table is deleted per the convention
above.

Step 1 - `user_media_list` - shipped 2026-09-09 (`87108271` onwards);
`docs/roadmap.md` keeps the record and its table is deleted per the convention
above. Steps 4-5 of the multi-user spec are not started.

Step 2 - accounts, the `user` role, profiles and community aggregates - shipped
2026-09-10 (`6bb22b29`..`242a6509`); `docs/roadmap.md` keeps the record and its
table is deleted per the convention above. Steps 4-5 are not started.

Step 3 - per-user `plan_next` and `seasonal` - shipped 2026-09-10
(`426045a2`, all eleven tasks); the Backup and Pull round trip was run by hand
afterwards and both tabs restored unchanged. `docs/roadmap.md` keeps the record
and its table is deleted per the convention above. Steps 4-5 are not started.
The one check nobody has run is Task 10 Step 7's browser pass: log out and
confirm `/plan`, `/seasonal`, `/seasonal/:id` and `/statistics` land on
`/login?next=...`.

Step 4 - Google Sheets for multiple users - shipped 2026-09-10, all eleven
tasks plus a twelfth the plan did not list (`username` on the Plan Next and
Seasonal tabs, the debt Step 3 named). The by-hand Backup and Pull All round
trip was run on the live company database afterwards. `docs/roadmap.md` keeps
the record and this table is deleted per the convention above. Step 5 (note
scoping) is not started.

## Step 5 - notes scoped per section

`docs/superpowers/plans/2026-09-08-step5-notes-scoping.md`. `<who>` = `step5-home`.

| # | Task | Status |
|---|---|---|
| 1 | `scope` on `NoteSection` | done 061c0072 |
| 2 | Serve `scope` on `/api/notes/sections` | done |
| 3 | `Viewer.user_id` | done (the field already existed; this adds its test) |
| 4 | `note.author_id` | wip step5-home |
| 5 | `quote.author_id` | todo |
| 6 | `meme.author_id` | todo |
| 7 | Personal sections are read only by their author | todo |
| 8 | Writes follow the scope, and one public-profile read | todo |
| 9 | `remark` - author recorded, one-per-owner kept | todo |
| 10 | `note` - four owner FKs and a `num_nonnulls` CHECK | todo |
| 11 | `meme` - four owner FKs and a `num_nonnulls` CHECK | todo |
| 12 | Record what changed | todo |

## Open items

Unclaimed. None block using the app.

| Item | Where | Status |
|---|---|---|
| **The auth-hardening gate. Step 2 shipped the `user` role, so an admin can now invite a non-admin - and must not, until this lands** | Two defects, both pre-existing and both deliberately out of Step 2's scope: the login cookie is set `secure=False` **unconditionally** (`app/routers/auth.py`), and **nothing fails fast on a default `JWT_SECRET_KEY` or `ADMIN_PASSWORD`** (`app/config.py`; `validate_production()` went away with the GCP code). Tolerable for one local user; an authentication bypass once somebody else has a password here. `docs/authentication.md` states the gate | todo |
| The `acting_user_id` guest-to-admin fallback still stands | A logged-out visitor still reads the lowest-username admin's list, so the public pages still show that account's statuses and ratings. Step 2's plan neither removes it nor lists it in its Definition of done; removing it is a visible behaviour change and needs a decision about what a guest should see. Step 3 narrowed it - `plan_next` and `seasonal` answer 401 now, and `viewer_user_id` has no fallback at all - but `acting_user_id` still falls back for the list columns. `app/services/domain/user_list.py` | todo |
| `self.personal_notes` is granted but enforced nowhere | Nothing reads it; personal notes are still gated only by the `personal_notes` field group. Note scoping is Step 5 | todo |
| The `guest` role has no `media_type.game`, so a logged-out visitor sees an empty Games library | `role_permission` rows were seeded 2026-08-29, before games existed; the other eight types are granted. Pre-dates Step 1 and is a permissions decision, not a bug to fix blind - grant it on `/roles` if guests should see games | todo |
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
| Step 3 migrations | the **company** db is at `m3b1seasonal` (head) as of 2026-09-10: `m3a1plannext`, `m3a2plandrop` and `m3b1seasonal` ran over 84 plan rows (64 entry, 20 franchise, 0 series, none dangling) and 96 seasonal rows, and the downgrade/upgrade round trip was exercised with no loss. A Backup and Pull round trip on the post-migration data succeeded. The home db is still at `m1b1anime`: `alembic upgrade head` **before** any Pull there, or the sheet's Plan Next and Seasonal tabs will not fit the schema. Pre-Step-3 dump: `~/anime_site_pre_step3_20260910.sql` (company) |
| Pre-Step-1 dump | `~/anime_site_home_pre_step1_20260909.sql` (3.2 MB, home, taken before the `m0a*`..`m1b1anime` run; that run deleted 2 orphaned `media_credit` and 10 orphaned `media_tag` rows, by design) |
| Pre-Docker dump | `~/anime_site_home_pre_docker_20260908.sql` (3.2 MB, taken from native 17.6 before the container migration) |
| Pre-migration dump | `~/anime_site_pre_games_20260906_134907.sql` (company) |
| Home dumps | `~/anime_site_home_pre_publisher_20260907.sql` (before the publisher backfill) and `~/anime_site_home_pre_pull_20260907.sql` (before Pull All) |
| Studio data | 45 duplicate studios removed by hand 2026-09-07; the delete cascaded ~377 credits away, rebuilt by Pull All from the entry tabs' `studio` columns. Now 78 studios, 483 studio credits, 0 duplicate clusters, and all 78 local ids match the sheet (28 were realigned to the sheet's ids after Pull matched them by name) |
| Pull All | run on home 2026-09-09 after the migration, all 40 tabs, 0 credit conflicts, 0 invented entities. Needed the `Game Copy` fix below first. Post-pull: 2081 `media` / `user_media_list`, 833 `anime`, 88 `game_copy`, 0 orphans |
| `Game Copy` identity | `game_copy` mints its uuid per database (the Steam import creates the rows), so the sheet's uuid always missed and the INSERT hit `uq_game_copy_row`, killing the whole Pull. Added to `DERIVED_IDENTITY_KEYS` on 2026-09-09 |
| `.env` gap | none on this machine - `IGDB_CLIENT_ID` / `IGDB_CLIENT_SECRET` and `STEAM_API_KEY` / `STEAM_ID` are all set. Steam verified live 2026-09-07: 80 games owned, 53 with playtime. `.env` travels nowhere, so the other machine and Cloud Run still need the two Steam vars |
| Step 4 sheet | the **company** database ran a Backup and a Pull All by hand on 2026-09-10, after the code landed: the sheet now carries the `Users` and `User Media List` tabs and a `username` column on Plan Next and Seasonal. **The home machine must `git pull` before its next Pull All** - an older checkout has no Users tab and no username resolution, so it would restore the accounts nowhere and file every plan and season rating under `admin`. No migration is involved; the schema is unchanged by this step |
| Step 4 test db | `anime_site_test_step4`, created 2026-09-10 in the container; droppable |
| Step 5 test db | `anime_site_test_step5`, created 2026-09-10 in the container (home); droppable |
| Droppable test dbs | The old list lived in the **native** server, which is now stopped — those databases are unreachable and effectively gone (the data directory is still on disk at `C:/Program Files/PostgreSQL/17/data` if anything is ever needed from it). The container currently holds `anime_site_test`, `anime_site_test_step2` (created 2026-09-10 for Step 2; **not dropped**), `anime_site_test_step3` (created 2026-09-10; Step 3 was finished on it), `anime_site_test_gcprm`, `anime_site_test_step0` and `anime_site_test_step1` / `_step1b` / `_step1c` / `_step1d` (created 2026-09-09; `_step1d` is the one Step 1 was finished on; the b and c copies exist so parallel agents do not reset each other's schema mid-run); all are droppable |
