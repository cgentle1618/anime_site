# Progress

Status only. No prose, no summaries - one line per task, edited in place.

Status values: `todo` - `wip <who>` - `done <sha>` - `blocked <one clause>` - `skipped <one clause>`
`<who>` is a session or agent label, so two sessions never claim the same task.

A finished plan's table is deleted from here; `docs/roadmap.md` keeps the record.

Last updated: 2026-09-11

---

## In flight

**The authorization system** - spec approved, `294bfe7d`.
**[2026-09-10-authorization-redesign-design.md](superpowers/specs/2026-09-10-authorization-redesign-design.md)**,
ten decisions, six sections, plus a post-Phase-A audit of sections 2-6.

| Phase | What | Status |
|---|---|---|
| 0 | Object-level guard on `/api/me/list/{media_id}` | done 4746b1bc |
| A | The capability axis: `admin.authz`, `manage.catalog`, `manage.pipelines`, the `super` role | done, merged 3fc65ba3 |
| A.1 | Pull may not restore the three authorization tabs without `admin.authz` | done a4b9d554 |
| B | The access-mode axis (spec section 2) - five tables, labels and field groups leave the role axis | todo, needs a plan |
| C | Write binding (decision 9) - writes follow reads on every client-supplied entry id | wip phase-c (1/5 done), planned: [2026-09-11-authz-phase-c-write-binding.md](superpowers/plans/2026-09-11-authz-phase-c-write-binding.md) |
| D | Admin UI: the access-mode page, the per-account panel, the mode switcher | todo, needs a plan |

Open questions the redesign inherits; #1 is answered and no longer gates
Phase C:

| # | Question | Status |
|---|---|---|
| 1 | Audit every **other** write path taking a client-supplied entry id; only `me_list.py` and `plan_next.py` were done | done, spec "The write-binding audit (2026-09-11)" |
| 2 | `field_group.personal_notes` gates a query parameter and nothing on any response, and is still labelled "Personal Reviews" | todo |
| 3 | One remark per owner, site-wide - the `remark` column_property cannot know who is asking | todo |
| 4 | Note writes answer 403; every other gate answers 401 or 404. Two conventions are running | todo |

Read before designing: **[authorization.md](authorization.md#what-the-redesign-inherits)**.
`docs/roadmap.md` holds the record of what Phases 0, A and A.1 actually did.

Multi-user Steps 0-5 are finished and their entries are gone from this file;
`docs/roadmap.md` keeps the record, per the convention above.

To settle:

| # | Question | Status |
|---|---|---|
| 1 | `field_group.personal_notes` gates a query parameter and nothing on any response, and is still labelled "Personal Reviews" | todo |
| 2 | No SPA surface for a non-admin: notes editors and tracker controls are `isAdmin`-only, so the `user` role is usable but not useful | todo |
| 3 | One remark per owner, site-wide - the `remark` column_property cannot know who is asking | todo |
| 4 | Note writes answer 403; every other gate answers 401 or 404. Two conventions are running | todo |

Read before designing: **[authorization.md](authorization.md#what-the-redesign-inherits)**
- the four gates that already exist, the rules not to break, and the lessons
from making the system multi-user. The page was audited against the code on
2026-09-10 and ten stale claims corrected, so it can be trusted as a starting
point.

## Open items

Unclaimed. None block using the app.

**The auth-hardening gate is closed** (2026-09-10). `APP_ENV` drives the login
cookie's `Secure` flag and `Settings.validate_secrets()` refuses a default
`JWT_SECRET_KEY` or `ADMIN_PASSWORD` in every environment. Two auth items stay
open by choice and neither blocks inviting somebody: **session lifetime** is a
flat 24 hours with no refresh or revocation, and there is **no password reset**
- an admin sets one at `/users`.

**The guest fallback is gone** (2026-09-10). A logged-out visitor has no
list: statuses, ratings and progress serialise as null, the library table shows
`-`, and the "My tracker" card does not render. `installation_owner_id` keeps
the half of the old behaviour that was legitimate - naming an owner for a
restore or a pipeline - and is not on any request path. Two defects surfaced
while removing it and are fixed: `POST /{type}/{id}/complete` wrote to the
lowest-username admin's list rather than the caller's, and a personal-column
filter from a guest cross-joined `user_media_list` and matched every account's
rows.

**Both machines need `APP_ENV=development` in `.env`.** Done on both, and both
hold real `JWT_SECRET_KEY` and `ADMIN_PASSWORD` values - company verified
2026-09-11 by starting the app, which `validate_secrets()` would refuse
otherwise.

| Item | Where | Status |
|---|---|---|
| `Note`, `Meme` and `Quote` tabs carry `author_id` as a raw uuid, so authorship does not round-trip | Each machine's lifespan mints its own `admin`, and the `Users` tab's username match keeps the local id - so the other machine's admin rows restore under this one's. `709f9f00` stopped the `Quote` tab dying on it (FK violation, whole tab rolled back); the durable fix is a `username` column on the three tabs, the way `Plan Next` has one. Invisible with one account; needed before a second person writes a note. `tabs.py:259/268/269` | todo |
| The logged-out redirect was never checked in a browser | Step 3 Task 10's last step: log out and confirm `/plan`, `/seasonal`, `/seasonal/:id` and `/statistics` land on `/login?next=...`. What is missing is only the **browser** check - the API side is tested AND so is the component: `frontend/src/components/layout/ProtectedRoute.test.jsx` holds three `ProtectedRoute requireAuth` tests. This row previously claimed `requireAuth` was untested, which was false (corrected 2026-09-11). Carried over when the Step 0-5 entries were removed | todo |
| Community aggregates are not visibility-filtered | `/api/community/{media_id}` filters on `users.list_is_public` but applies neither the media-type gate nor the label anti-join, so a viewer lacking `media_type.game` can still read a game's rating average if they know its `media_id`. Found by the 2026-09-10 doc audit and recorded as an accepted residual in `docs/authorization.md`; the id has to come from a visible response first, which is the same (weak) argument that covers `/static/covers/`. `app/routers/community.py` | todo |
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
| Dev db | **home machine**, in the `anime_site_postgres_db` container (`postgres:17`) on `127.0.0.1:5432`, at `m5b2memefks` (head) as of 2026-09-10. Migrated off native PostgreSQL 17.6 on 2026-09-08 by dump and restore; all 43 non-empty tables verified row-for-row. The native 17 and 18 Windows services are stopped and set to Manual |
| Company db | at **`m5b2memefks` (head)** as of 2026-09-11, after a `git pull`, `alembic upgrade head` and Pull All; `APP_ENV=development` is set and the app starts, so the hardening item above is satisfied here. The Pull All failed on the `Quote` tab and was completed after `709f9f00` (11/11 restored). Previously at `m3b1seasonal` - `m3a1plannext`, `m3a2plandrop` and `m3b1seasonal` ran over 84 plan rows (64 entry, 20 franchise, 0 series, none dangling) and 96 seasonal rows, and the downgrade/upgrade round trip was exercised with no loss. A Backup and Pull round trip on the post-migration data succeeded. The home db went to head on 2026-09-10 (Step 5). Both are now at head. Pre-Step-3 dump: `~/anime_site_pre_step3_20260910.sql` (company) |
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
| Step 5 test db | `anime_site_test_step5`, created 2026-09-10 in the container (home); Step 5 was finished on it; droppable |
| Droppable test dbs | The old list lived in the **native** server, which is now stopped — those databases are unreachable and effectively gone (the data directory is still on disk at `C:/Program Files/PostgreSQL/17/data` if anything is ever needed from it). The container currently holds `anime_site_test`, `anime_site_test_step2` (created 2026-09-10 for Step 2; **not dropped**), `anime_site_test_step3` (created 2026-09-10; Step 3 was finished on it), `anime_site_test_gcprm`, `anime_site_test_step0` and `anime_site_test_step1` / `_step1b` / `_step1c` / `_step1d` (created 2026-09-09; `_step1d` is the one Step 1 was finished on; the b and c copies exist so parallel agents do not reset each other's schema mid-run); all are droppable |
