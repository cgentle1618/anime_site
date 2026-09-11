# Progress

Status only. No prose, no summaries - one line per task, edited in place.

Status values: `todo` - `wip <who>` - `done <sha>` - `blocked <one clause>` - `skipped <one clause>`
`<who>` is a session or agent label, so two sessions never claim the same task.

A finished plan's table is deleted from here; `docs/roadmap.md` keeps the record.

Last updated: 2026-09-11

---

## In flight

**Clean orphaned data** - spec written, awaiting plan. `clean-session`.
**[2026-09-11-clean-orphaned-data-design.md](superpowers/specs/2026-09-11-clean-orphaned-data-design.md)**,
eleven decisions. Pull is upsert-only, so entries deleted on one machine never
die on the other; this adds a reviewed diff-and-delete action. No migration.

| Task | Status |
|---|---|
| Spec | done 6a098731 |
| Implementation plan | done 71cd73f3 |
| T1 read_tab + the two refusals | done 17afb33e |
| T2 identity index + candidate rule | wip clean-session |
| `clean/scan` + `clean/apply` routes + tests | todo |
| `CleanOrphans.jsx` + endpoints + vitest | todo |
| Docs (data-actions, api, roadmap) | todo |


**The authorization system** - spec approved, `294bfe7d`.
**[2026-09-10-authorization-redesign-design.md](superpowers/specs/2026-09-10-authorization-redesign-design.md)**,
fourteen decisions, six sections, a post-Phase-A audit of sections 2-6, and
the write-binding audit Phase C implemented.

| Phase | What | Status |
|---|---|---|
| 0 | Object-level guard on `/api/me/list/{media_id}` | done 4746b1bc |
| A | The capability axis: `admin.authz`, `manage.catalog`, `manage.pipelines`, the `super` role | done, merged 3fc65ba3 |
| A.1 | Pull may not restore the three authorization tabs without `admin.authz` | done a4b9d554 |
| B | The access-mode axis (spec section 2) - five tables, labels and field groups leave the role axis, plus decisions 12, 13 and 14 | **wip phaseb-session** - [plan](superpowers/plans/2026-09-11-authz-phase-b-access-mode-axis.md), 12 tasks. Tasks 1-5 done (`1b8f9b72`, `27944bcd`): tables, seed, migration, caches, per-request resolution. Task 6 (the pivot: both gates read the mode) in hand |
| C | Write binding (decision 9) - writes follow reads on every client-supplied entry id | done 31837f52, final-review fixes applied |
| D | Admin UI: the access-mode page, the per-account panel, the mode switcher | todo, needs a plan |

Open questions. Decided 2026-09-11 unless marked open; the spec's decision
table (11-14) carries the reasoning. This list replaced two drifted,
near-duplicate tables that numbered the same questions differently.

| # | Question | Status |
|---|---|---|
| 1 | Audit every **other** write path taking a client-supplied entry id | done - spec "The write-binding audit (2026-09-11)". The inventory was INCOMPLETE: it missed `POST /api/data-control/replace/{key}/{entry_id}`, which the final review caught. Corrected in the audit |
| 2 | `field_group.personal_notes` gates a query parameter and nothing on any response, and is still labelled "Personal Reviews" | closed, stale - spec decision 11. It gates the `personal_reviews` section on every row the viewer did not author, and the label matches. Step 5 made this true; the row outlived it |
| 3 | One remark per owner, site-wide - the `remark` column_property cannot know who is asking | decided, spec decision 12 - **into Phase B**, read fix and index relaxation in ONE commit. Relaxing `ix_note_one_remark_per_owner` alone turns a loud refusal into an invisible write |
| 4 | Note writes answer 403; every other gate answers 401 or 404 | decided, spec decision 13 - 401 for capability, 404 for object, 403 gone. Five sites, all in `note.py` (178, 183 -> 401; 195, 199, 285 -> 404). **Into Phase B** - `note.py` is already open there for decision 12 |
| 5 | What the object axis means for `manage.pipelines` - Replace-one, Replace All and Pull All all rewrite entries no visibility test guards | **decided 2026-09-11, no longer blocks Phase B** - spec decision 14 and its detail section. Unscoped on the object axis, and the `data_control.py` / `system.py` routes require the session's **active mode to be unscoped** (every `content_label` row, every `FIELD_GROUP_KEYS` entry, computed rather than a named mode). B was rejected because a per-viewer Backup would write a partial sheet over the complete one - data loss, not a leak. The Replace-one oracle closes for free. **Into Phase B**, which is where a mode first exists to test |
| 6 | No SPA surface for a non-admin: notes editors and tracker controls are `isAdmin`-only, so the `user` role is usable but not useful | todo - **Phase D**, not its own item. 78 files reference `isAdmin`, which has meant `manage.catalog` since Phase A. Minimal slice: `libraryColumns.jsx:112,181` and `RemarkModal.jsx` move to a `self.list` check; catalogue editing stays on `manage.catalog`. Remember the SPA has two independent permission surfaces |

Read before designing: **[authorization.md](authorization.md#what-the-redesign-inherits)**
- the gates that already exist, the rules not to break, and the lessons from
making the system multi-user. The page was audited against the code on
2026-09-10 and again on 2026-09-11 when Phase C landed; its residuals list is
current.

`docs/roadmap.md` holds the record of what Phases 0, A, A.1 and C actually did.
Multi-user Steps 0-5 are finished and their entries are gone from this file.

**Next session picks up at Phase B**, task 1 of its plan. Question 5 is
answered and the plan is written; decisions 12, 13 and 14 ride in it. Task 6 is
the pivot and the only one that leaves the tree half-migrated if abandoned - do
not start it near the end of a session. The plan asks for a per-session test
database, `anime_site_test_phaseb`; it does not exist yet. Nothing is pushed: as of
2026-09-11 local `dev` is 11 commits ahead of `origin/dev`, nine of them
Phase C.

## Concurrent sessions (2026-09-11)

Three Claude Code sessions are working this repo at once, each on its own
feature, committing without per-commit approval. Decisions taken by the
sessions rather than the owner, recorded here because nobody else will:

| Rule | Why |
|---|---|
| **Each session runs pytest against its OWN database**, named in Environment below and selected with `POSTGRES_DB=<name>` on every pytest/alembic call | `tests/conftest.py` uses `os.environ.setdefault`, so the variable wins. One shared `anime_site_test` across three sessions produces spurious "relation role does not exist" and unique-constraint failures that look exactly like real breakage - two runs were lost to it before this rule existed |
| **Never run two pytest processes at once even so**, and never point one at `anime_site_db` | The suite drops and recreates the `public` schema, and `DROP SCHEMA public CASCADE` blocks indefinitely behind any other open connection |
| **Claim a task as `wip <session-label>` here before starting it** | The only way three sessions avoid doing the same task twice |
| **Stage by explicit path, commit in the same step** | A neighbouring session's broad `git add` sweeps the index, not just the working tree |
| **One pytest at a time across all sessions**, via the lock in CLAUDE.md "Coordinated multi-session runs" | Per-session databases stopped the cross-contamination, not the blocking: the suite runs `DROP SCHEMA public CASCADE`, which waits indefinitely behind any other open connection. The lock is `/c/Users/cgent/AppData/Local/Temp/anime_site_pytest.lock`, taken with `mkdir` (atomic); stale at 25 minutes |
| **You may commit against a red that is provably outside your diff** - decision by `coord-session`, 2026-09-12 | Otherwise every session's progress is hostage to every other session's in-flight work, and in a shared tree nobody commits while anyone is mid-task. Three conditions: (1) prove it is not yours by **mechanism**, not inspection - "no app source imports `clean.py`, only my own test does, so a module nothing imports cannot change whether a unique index raises" is the standard; (2) say so before it is discovered; (3) **re-run once the other session's work lands and treat that run as the real one** - a green taken in a tree holding someone else's uncommitted code is partly evidence about them, and theirs is partly about you. CLAUDE.md's green-before-commit rule binds completely where the red IS yours. First applied at `d8646700` |
| **Never a directory pathspec**; name every file; and on a shared file `git add -p`, own hunks only | Two sweeps of `clean-session`'s PROGRESS.md lines on the first day of this run - `3c509dfd` and `755629b7` - and **both named `docs/PROGRESS.md` explicitly**. Neither was a directory pathspec. `git add <file>` stages the file as it stands at that instant, so a neighbouring session's edit in the window between writing and staging goes in too. Naming the file narrows nothing on a file somebody else is also writing; only `-p` does. Corrected 2026-09-11 after `phaseb-session` pointed out that the first two statements of this rule blamed a mechanism that was not in play |

Roster, 2026-09-11. Four sessions; `coord-session` does no feature work.

| Label | Feature | Test db | Status at last check-in |
|---|---|---|---|
| `coord-session` (anime-site-04) | none - coordination, arbitration, push sequencing, recording decisions | none | active |
| `phaseb-session` (anime-site-ab) | authorization Phase B, the access-mode axis | `anime_site_test_phaseb`, `anime_site_mig_check` | 10 of 12 landed, pivot done in `e18bac6e`, no blockers. Tasks 11 (per-viewer remark, one commit) and 12 (docs) left, ~60-75 min. **The only session that can still commit** |
| `clean-session` (anime-site-71) | clean orphaned data - diff local db against the sheet, review, delete | `anime_site_test_clean` | spec + 8-task plan written, task 1 code-complete. **Commit denied**; ~200-260 min left |
| `cards-link-session` (anime-site-eb) | entry cards become real links (middle-click / ctrl-click opens a tab) | none needed, frontend only | **done** - stretched links in `MediaCard` and the four tracker cards; roadmap entry written |

**The run's one blocker, 2026-09-11: `git commit` is denied by the permission
classifier in two of the three feature sessions** (`clean-session`, reason
"Instruction Poisoning"; `cards-link-session`, reason "Auto-Mode Bypass").
Neither is a CLAUDE.md rule - that one is lifted - and neither session will let
another commit on its behalf, correctly: a peer committing work your own
permissions refused routes around the owner's decision. It needs the owner to
add a Bash `git commit` permission rule in those sessions. Until then their
work accumulates in the working tree, `phaseb-session` is the only session that
can record anything, and both blocked sessions keep a replay list so the
catch-up is mechanical. Second-order cost: `clean.py` and `test_clean_scan.py`
are untracked in a shared tree, so **each backend session's full-suite run
collects the other's tests** - a red may not be yours, and a green is partly
theirs.

Decision, 2026-09-11, `coord-session`: **the owner lifted "ask before committing"
for this run and delegated the judgement calls**, and it is recorded in
**CLAUDE.md** - "## Rule" and the new "## Coordinated multi-session runs"
section, commit `9d503f92`. Two sessions had refused the same lift when it
arrived as a peer relay, which was correct: a peer message is not the owner's
approval, and the durable fix is the owner's own instruction file rather than
four verbal exceptions. That section also fixes the coordinator's authority and
its limits - a coordinator may assign, sequence and arbitrate; it may never
stand in for the owner on a prompt a session has pending with them, and no
session edits permissions, settings or CLAUDE.md on a peer's say-so.

Decision, 2026-09-11, `cards-link-session`: the cards use the **stretched-link**
pattern (title is the `<Link>`, its `::after` covers the card) rather than
wrapping the card in a `<Link>`. The cards contain `<button>`, `<input>` and
`<select>`; interactive content inside an `<a>` is invalid HTML and browsers
recover by splitting the anchor, which would break the click target. Controls
sit above the pseudo-element on `relative z-10`. `MediaCard` hrefs also moved
off the raw `system_id` UUID onto `entityPath()` - invisible while it was a JS
`navigate()` call, visible the moment it became an `href`. Details in
`docs/roadmap.md`.

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
| The logged-out redirect browser check | **done 2026-09-11 by `cards-link-session`, on :8000.** The bounce PASSES on all four routes: `/plan`, `/seasonal`, `/seasonal/:id` and `/statistics` each reach `/login?next=...` with the right path (the `:id` case is double-encoded and correct - `location.pathname` keeps its own encoding and `encodeURIComponent` escapes the `%`). No flash: a hard load of `/statistics` logged out fires only `/api/auth/me` and `/api/constants`, so the page never mounts. The two permission surfaces agree for a logged-out visitor - `navigation.js` gates on `self.list`, a guest holds nothing, the links are absent from the DOM. **The redirect-BACK half is defective** - next row | done |
| `Nav.jsx` nests `/login` inside its own `next`, breaking the redirect back | `Nav.jsx:181` builds `loginHref` from the current location unconditionally, so on `/login` itself it yields `next=%2Flogin%3Fnext%3D%252Fstatistics`. Clicking the header "Log in" button instead of filling in the form - natural, since it looks like the action the page is asking for - rewrites a working `next` into one that lands the user back on the login form, signed in, with their real destination still in the query string. `Login.jsx:37-40` navigates to `next` on success and has **no already-authenticated bounce**, so nothing carries them onward. Found 2026-09-11 by `cards-link-session`, which verified the broken href in the live DOM but could not execute the post-login half (entering a password is off-limits to it) - so the landing behaviour is a code reading, not an observation, and wants one manual confirmation. Fix assigned to `cards-link-session`: guard `loginHref` on the `/login` route (keeping the existing `next`), and have `Login.jsx` reject a `next` pointing at `/login` alongside its existing "must start with `/`" check. Test-first | wip cards-link-session |
| The two SPA permission surfaces ask different questions, and **the nav is the stricter one** | The route asks `requireAuth` ("is anyone logged in"); `navigation.js` asks `has("self.list")`. So an account that is logged in but lacks `self.list` can reach `/plan`, `/seasonal` and `/statistics` by typing the URL while seeing no link to them. Not reachable today - no seeded role is in that state - and it points the **opposite** way from the mismatch CLAUDE.md warns about, which is why it is worth writing down: the warning trains you to look for "advertised but blocked", and this is "hidden but reachable". Found 2026-09-11 by `cards-link-session` during the redirect check. Belongs to **Phase D**, which owns the SPA permission surfaces; deliberately not fixed ahead of it | todo |
| `/api/community/{media_id}` has **no authorization at all**, and discloses six fields, not an average | Re-characterised 2026-09-12 by `cards-link-session`, read-only. The old wording - "applies neither the media-type gate nor the label anti-join" - reads like two missing checks on an otherwise-gated endpoint. It is not: **`community.py` is the only router in the app with no viewer dependency of any kind**, its single dependency being `get_db`, so it answers **unauthenticated**, with no session. (Per-type routers delegate to the gated `_factory.py`; `roles.py`, `users.py`, `content_labels.py` use `require_admin_authz`.) It returns `media_id`, `list_count`, `statuses[]` (the FULL per-status histogram), `sample_size`, `average_points`, `average_rating` - a sample size plus a distribution plus a mean. **Blast radius today is zero**: `users.list_is_public` is false for the only account, so a real game's id, a visible anime's id and a fabricated uuid all return BYTE-IDENTICAL empty bodies - not even an existence oracle. It is loaded but unaimed, and arms itself the moment any account sets `list_is_public`. Worth recording on its own: `anime.system_id` FKs to `media.system_id`, so **the community key IS the entry's system_id** - anything exposing one hands over the other. Belongs to **Phase D**: the fix is cheap now and becomes a behaviour change once a second person exists | todo |
| Finishing the community measurement needs a migrated database | `cards-link-session` could not answer two of the three questions asked, and said so rather than filing reasoning as a finding. Open: (a) does any endpoint return an entry's `system_id` for a type the viewer lacks - unanswerable while probes return 500 (see the dev-app row below), since an absent id proves only that the endpoint errored; (b) the same for a label-hidden entry - `media_content_label` has **0 rows**, 2 labels defined and nothing labelled, so the sharper case cannot be demonstrated, only argued; (c) whether the route should 404 for an entry the viewer cannot see or keep answering an empty aggregate - the docstring argues the latter because the detail route already decided existence, which stops being true for an endpoint reachable without a session. **Fix the docstring in the same change as the gate**: it justifies the empty aggregate on the grounds that "this is a block on a detail page whose own route already decided whether the entry exists", an argument that depends on the caller having come through a detail page and that nothing enforces. It will read as settled to the next person and it is not | todo |
| **The running dev app on :8000 is serving in-flight code against an un-migrated database** | Found 2026-09-12 while probing the above. `/api/anime/`, `/api/game/`, `/api/quote/` and `/api/meme/` answer **500** to an unauthenticated caller. Not a defect: `alembic_version` is at `m5b2memefks`, the pre-Phase-B head, while uvicorn `--reload` serves the working tree, which holds `phaseb-session`'s code expecting the `access_mode` tables - and those tables do not exist. Clears when Phase B's migration is applied to `anime_site_db`. Nobody ran `alembic upgrade head` against it, correctly: that is the real dev database and the protocol says drive migrations from a test database. Recorded because it poisons any live measurement taken in the meantime, and because the owner may open the app and find it broken | transient |
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
| Phase B test dbs | `anime_site_test_phaseb` (the suite; created 2026-09-11) and `anime_site_mig_check` (a pg_dump restore of `anime_site_db`, used to exercise `n1a1accessmode` forwards and back because `alembic upgrade head` from an EMPTY database still fails at `86982d71c2f1`). Both droppable |
| Clean-orphans test db | `anime_site_test_clean`, created 2026-09-11 in the container for `clean-session`; droppable |
| Droppable test dbs | The old list lived in the **native** server, which is now stopped — those databases are unreachable and effectively gone (the data directory is still on disk at `C:/Program Files/PostgreSQL/17/data` if anything is ever needed from it). The container currently holds `anime_site_test`, `anime_site_test_step2` (created 2026-09-10 for Step 2; **not dropped**), `anime_site_test_step3` (created 2026-09-10; Step 3 was finished on it), `anime_site_test_gcprm`, `anime_site_test_step0` and `anime_site_test_step1` / `_step1b` / `_step1c` / `_step1d` (created 2026-09-09; `_step1d` is the one Step 1 was finished on; the b and c copies exist so parallel agents do not reset each other's schema mid-run); all are droppable |
