# Progress

Status only. No prose, no summaries - one line per task, edited in place.

Status values: `todo` - `wip <who>` - `done <sha>` - `blocked <one clause>` - `skipped <one clause>`
`<who>` is a session or agent label, so two sessions never claim the same task.

A finished plan's table is deleted from here; `docs/roadmap.md` keeps the record.

Last updated: 2026-09-13

---

## In flight

| Task | Status |
|---|---|
| Game completion axes take an `Inapplicable` state (`feat/game-inapplicable`, migration `g1c2f3flags4`) | wip anime-site-9c |

The game 攻略 / 劇情 / 待辦 note groups shipped in #147 and the AniList columns
in #148; `docs/roadmap.md` holds the record for both.

The home machine is current: `anime_site_db` is at `al1n2ilist` and a Backup
ran against it on 2026-09-12 at 23:07, so the sheet no longer names the
retired `guides` and `builds_and_mods` sections. That mattered because **Pull
does not validate section keys** - a Pull All from the pre-Backup sheet would
have restored them.

The authorization redesign - phases 0, A, A.1, B, C and D - is
finished and its table is gone; `docs/roadmap.md` holds what each phase did
and why, and the gates themselves are described in
[authorization.md](authorization.md#rules-not-to-break).

## Concurrent sessions

The 2026-09-11 run is closed. All four sessions' work landed: Phase B and
Phase D, clean-orphaned-data, and entry cards as real links. The rules that
run produced - per-session databases, the pytest lock, explicit paths, `git
add -p` on shared files, `git commit -- <paths>` - live in **CLAUDE.md**
("Concurrent Claude Code Sessions" and "Coordinated multi-session runs"),
which is where the next run should read them.

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
| **The company machine still files rows under `admin`** | The admin account holds no user data as of `o1a1ownerflag` (2026-09-12), applied to the home `anime_site_db`: 2081 list rows, 1817 notes, 96 seasonals, 88 copies, 84 plans, 24 memes and 11 quotes moved to `cg1618`, which now holds `is_installation_owner`. The company database has neither the migration nor the move. **Arriving there: `git pull`, `alembic upgrade head`, then Pull All** - the migration will pick the same account (first non-root account) and the sheet carries the flag, so the two agree either way, but running them out of order files a restore under whichever account that database's fallback names. Pre-migration dump: `~/anime_site_pre_owner_flag_20260912.sql` (home) | todo |
| **Who emptied the backup sheet is still unknown** | Eliminated, with evidence rather than recollection: the **test suite** (all 3877 tests re-run with the real Sheets accessor patched to throw - all passed, so no test ever reaches the live sheet; now enforced permanently by an autouse guard, `9a9e07d7`); **both other sessions** (one frontend-only, one docs-only, neither started a server or a database); **every database on this machine** (a Backup logs into whichever DB it ran against, and across all eight the last one before the recovery was 2026-09-10 20:26); and the **stale codex worktree** (pre-`app/` layout, no `.env`, so the app refuses to start there). That leaves the **company machine** - a Backup there against a freshly-migrated-but-empty database would blank every tab and log into that database, invisible from here - or a manual clear in the browser. Only the owner can close this | todo |
| **The company machine can still erase the sheet** | The guard exists in two commits, and **`fd9776c8` alone is not enough**: the guard it added probed `worksheet.get("A2:A2")` for truthiness, and gspread answers an empty cell with `[[]]`, so it refused every Backup on an installation with a legitimately empty tab. `c649f3c6` is the one that makes it usable. That machine has neither, and the sheet now holds the restored copy. **`git pull` there before running Backup**, not after | todo |
| `Note`, `Meme` and `Quote` tabs carry `author_id` as a raw uuid, so authorship does not round-trip | Each machine's lifespan mints its own `admin`, and the `Users` tab's username match keeps the local id - so the other machine's admin rows restore under this one's. `709f9f00` stopped the `Quote` tab dying on it (FK violation, whole tab rolled back); the durable fix is a `username` column on the three tabs, the way `Plan Next` has one. Invisible with one account; needed before a second person writes a note. `tabs.py:259/268/269` | todo |
| `/api/community/{media_id}` has **no authorization at all**, and discloses six fields, not an average | Re-characterised 2026-09-12 by `cards-link-session`, read-only. The old wording - "applies neither the media-type gate nor the label anti-join" - reads like two missing checks on an otherwise-gated endpoint. It is not: **`community.py` is the only router in the app with no viewer dependency of any kind**, its single dependency being `get_db`, so it answers **unauthenticated**, with no session. (Per-type routers delegate to the gated `_factory.py`; `roles.py`, `users.py`, `content_labels.py` use `require_admin_authz`.) It returns `media_id`, `list_count`, `statuses[]` (the FULL per-status histogram), `sample_size`, `average_points`, `average_rating` - a sample size plus a distribution plus a mean. **Blast radius today is zero**: `users.list_is_public` is false for the only account, so a real game's id, a visible anime's id and a fabricated uuid all return BYTE-IDENTICAL empty bodies - not even an existence oracle. It is loaded but unaimed, and arms itself the moment any account sets `list_is_public`. Worth recording on its own: `anime.system_id` FKs to `media.system_id`, so **the community key IS the entry's system_id** - anything exposing one hands over the other. Phase D shipped **without** fixing it - recorded as an accepted residual in [authorization.md](authorization.md#accepted-residuals). The fix is cheap now and becomes a behaviour change once a second person exists | todo |
| Finishing the community measurement needs a migrated database | `cards-link-session` could not answer two of the three questions asked, and said so rather than filing reasoning as a finding. Open: (a) does any endpoint return an entry's `system_id` for a type the viewer lacks - now answerable - `anime_site_db` is at `o1a1ownerflag`, so the probes that returned 500 against the un-migrated database no longer do; (b) the same for a label-hidden entry - `media_content_label` has **0 rows**, 2 labels defined and nothing labelled, so the sharper case cannot be demonstrated, only argued; (c) whether the route should 404 for an entry the viewer cannot see or keep answering an empty aggregate - the docstring argues the latter because the detail route already decided existence, which stops being true for an endpoint reachable without a session. **Fix the docstring in the same change as the gate**: it justifies the empty aggregate on the grounds that "this is a block on a detail page whose own route already decided whether the entry exists", an argument that depends on the caller having come through a detail page and that nothing enforces. It will read as settled to the next person and it is not | todo |
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
| Dev db | **home machine**, in the `anime_site_postgres_db` container (`postgres:17`) on `127.0.0.1:5432`, at `o1a1ownerflag` (head) as of 2026-09-12. Migrated off native PostgreSQL 17.6 on 2026-09-08 by dump and restore; all 43 non-empty tables verified row-for-row. The native 17 and 18 Windows services are stopped and set to Manual |
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
| Phase B test dbs | `anime_site_test_phaseb` (the suite; created 2026-09-11) and `anime_site_mig_check` (a pg_dump restore of `anime_site_db`, used to exercise `n1a1accessmode` forwards and back because `alembic upgrade head` from an EMPTY database still fails at `86982d71c2f1`). Both droppable |
| Clean-orphans test db | `anime_site_test_clean`, created 2026-09-11 in the container for `clean-session`; droppable |
| Owner-flag test db | `anime_site_test_owner`, created 2026-09-12 for the admin-holds-no-user-data change: a `pg_dump` restore of the real `anime_site_db`, used to exercise `o1a1ownerflag` forwards, backwards and forwards again before it was applied for real, then reused for the suite; droppable |
| Droppable test dbs | The old list lived in the **native** server, which is now stopped — those databases are unreachable and effectively gone (the data directory is still on disk at `C:/Program Files/PostgreSQL/17/data` if anything is ever needed from it). The container currently holds `anime_site_test`, `anime_site_test_step2` (created 2026-09-10 for Step 2; **not dropped**), `anime_site_test_step3` (created 2026-09-10; Step 3 was finished on it), `anime_site_test_gcprm`, `anime_site_test_step0` and `anime_site_test_step1` / `_step1b` / `_step1c` / `_step1d` (created 2026-09-09; `_step1d` is the one Step 1 was finished on; the b and c copies exist so parallel agents do not reset each other's schema mid-run); all are droppable |
