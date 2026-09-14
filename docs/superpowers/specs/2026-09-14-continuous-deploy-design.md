# Continuous deployment to the production box

Design, 2026-09-14. A merge to `main` deploys itself; a deploy that goes wrong
recovers itself or freezes and says so.

## The problem

Deploying today is a person on the box running `./deploy/deploy.sh`. That script
is already good — it dumps before it pulls, records the revision beside the dump,
and tags the outgoing image — but nothing runs it. A merged pull request changes
production only when somebody remembers to go and make it.

Two things the request did **not** need, checked rather than assumed:

- **Migrations already run themselves.** `entrypoint.sh` is `set -e`,
  `alembic upgrade head`, `exec uvicorn`.
- **The frontend already builds itself.** Stage 1 of `dockerfile` is
  `node:20-slim` running `npm run build`; `docker compose up -d --build` covers
  both.

So the missing pieces are exactly three: a **trigger**, a **health signal that
cannot lie**, and **recovery plus notification**.

## The constraint that decides the shape

**Nothing can reach the box.** No service publishes a port
(`tests/unit/test_prod_compose.py` fails if one appears), the only ingress is an
outbound Cloudflare Tunnel, and the box is on a phone hotspot with no DHCP
reservation, so it has no stable address either. GitHub cannot push, ssh or
webhook into it.

Every deploy must therefore be **box-initiated**.

**A self-hosted GitHub Actions runner**, which long-polls GitHub outbound.
Rejected: a `git ls-remote` poll loop on a systemd timer — fewer moving parts, and
it fits the timer machinery the off-box backup work installs, but deploy logs then
live only on the box and there is no approval mechanism, which the migration gate
below requires. Rejected: a signed webhook endpoint through the tunnel — instant
and no polling, at the cost of a publicly reachable endpoint that runs deploys,
whose safety rests on getting HMAC verification right.

## What "automatic rollback" can and cannot be

This is the heart of the design, and the naive version does not work.

`dockerfile` ends with `COPY . .`, so `alembic/versions/` is **baked into the
image**. `media-app:previous` does not contain a revision added by the deploy that
just failed. After a failed migration-bearing deploy the database holds the new
revision, so rolling the image back hands the old container a revision it has
never heard of. Demonstrated against a scratch database rather than reasoned
about:

    [ALEMBIC FATAL CRASH] Can't locate revision identified by 'zz9futurerev'
    FAILED: Can't locate revision identified by 'zz9futurerev'

`entrypoint.sh` runs under `set -e`, so the container exits non-zero, and
`restart: unless-stopped` turns that into a crash loop. **Code-only rollback after
a migration does not degrade — it fails outright, and the site stays down.**

It is also too late to prevent the data change. `alembic upgrade head` runs
*before* uvicorn binds a port, so no health probe can exist that catches a
migration before it commits. And `alembic downgrade` is not a restore: reversing a
dropped column recreates it empty.

Therefore the pipeline **classifies the deploy before it touches the box** — a
`git diff` over `alembic/versions/` between the deployed revision and the incoming
one — and runs one of two lanes.

### Lane A — no new revision

The common case: frontend work, bug fixes, docs. Fully unattended.

    merge -> deploy -> health
                         |
                         +-- 200 -> done, ping success
                         +-- 503 -> retag media-app:previous, up -d, re-check
                                         |
                                         +-- 200 -> rolled back, notify
                                         +-- 503 -> freeze, notify

Nothing here can lose data. The database was never modified.

### Lane B — the merge carries a revision

**It does not deploy on merge.** It pauses in a GitHub Environment protection rule
and notifies the owner, who approves it. The gate exists because this is the only
class of change that can destroy data, and because nothing on this box has ever
been restored successfully — the one time the documented rollback was executed it
restored old data under new code while every row count came back correct.

After approval, failure climbs a three-tier ladder:

| Tier | Condition | Action | Outcome |
| --- | --- | --- | --- |
| 1 | Build or CI fails | Nothing. Notify. | Production never touched; old container still serving |
| 2 | Deploy fails, revision reversible | `alembic downgrade <recorded>` **using the new image** (the only one holding that revision file), retag `media-app:previous`, `up -d`, re-check health | Site back up, schema reversed, **data not restored** |
| 3 | Tier 2 fails, or the revision is marked irreversible | Freeze. Touch nothing. Notify with the dump path, the revision, and the restore commands | Owner decides, with everything staged |

**Tier 2 never restores data, and its notification must not imply otherwise.** It
reverses schema, not content. A migration that dropped a column leaves that data
only in the pre-deploy dump. The message is *"rolled back; verify your data"*.

**Nothing in this pipeline ever restores the production database automatically.**
An automatic job able to overwrite production protects against nothing and risks
everything. Tier 3 stages the restore; a human runs it.

### Proving tier 2 rather than hoping

Tier 2 leans on `downgrade()`, and **no `downgrade()` in this repository has ever
been executed by anything.** `tests/api/test_migrations_build_the_schema.py`
proves the chain builds forward from zero; nothing proves it comes back.

So CI gains a round trip: for every revision a pull request adds, upgrade to it,
downgrade to its parent, upgrade again, against a scratch database. Nine revision
files exist and one is the baseline, so the walk is short.

Some migrations genuinely cannot be reversed — data transforms that delete or
rewrite rows. Those declare `irreversible = True` in the revision module. The test
skips them; **the pipeline reads the same marker and sends that deploy straight to
tier 3.** One fact, declared once, by the person who knows, consumed by both.

Note: `docs/PROGRESS.md` still lists "`alembic upgrade head` from an EMPTY db
fails at `86982d71c2f1`" as open. It is stale — the chain was squashed onto
`4832c83905a3_baseline_schema`, the single head is `s1e2asonalix`, and that
revision id now survives only as prose in the baseline's docstring. The line is
removed in the same change.

## The health signal

`app` deliberately has no healthcheck today, and the reasoning is sound: the
catch-all route serves the SPA for any path, so a check against `/` returns 200
with the database down, and a healthcheck that lies is worse than none.

What retires that reasoning is a check that cannot lie the same way.

**`GET /api/health`** opens a real database session, issues `SELECT 1`, and reads
`alembic_version.version_num`. It returns **200** with a bare `{"status": "ok"}`,
or **503** when the database is unreachable or the stored revision is not the head
the running code expects. That second condition is what catches a half-rolled-back
box, and it is the whole basis of the ladder.

- **The public response carries no detail.** The Cloudflare ingress routes
  everything at `media.cg1618.com` to `app:8000`, so this endpoint is on the
  public internet; publishing the alembic head there leaks the schema version and
  migration cadence for free. Detail — head, database latency — is admin-only.
- **The revision is read from `alembic_version.version_num` and nowhere else** —
  not from the files on disk, not from `alembic heads`. The off-box backup stamp
  asserts against that same table, and two authoritative answers that can disagree
  mid-deploy is worse than one.
- `docker-compose.prod.yml` gains a `healthcheck:` on `app`.
- `tests/unit/test_prod_compose.py::test_app_has_no_healthcheck` is replaced by a
  test asserting the healthcheck does **not** target the catch-all route, **with
  its comment rewritten** rather than the assertion deleted — a rule with no
  reason attached is the next reader's problem.
- The claim is asserted in **three places hundreds of lines apart**: that test,
  `docs/deployment-selfhost.md`, and `docs/notes/decisions.md`. All three change.
  Grep the claim, not the file.

## Shape

    .github/workflows/deploy.yml     the trigger, the gate, and nothing else
    deploy/deploy.sh                 unchanged in substance; gains --ci
    deploy/rollback.sh               the ladder; one implementation, two callers
    deploy/health.sh                 poll /api/health with a timeout
    deploy/drift.sh                  daily: deployed HEAD vs origin/main -> ping
    deploy/units/media-drift.{service,timer}

**The workflow does not check out and build.** The runner's workspace is
`~/actions-runner/_work/...`; the stack only works from `~/anime_site`, where
`.env` lives, where `static/covers` and `static/library` are bind-mounted, and
where `COMPOSE_PROJECT_NAME=media` decides which volume is the real database. A
deploy from the runner's own checkout would come up on a new empty volume while
the real data sat in the old one — which looks exactly like data loss, and is the
same failure `CLAUDE.md` warns about for worktrees.

So the job's deploy step is `cd ~/anime_site && ./deploy/deploy.sh --ci`.

**All logic stays in shell** — versioned, shellchecked, and identical to what a
human runs by hand. Rejected: expressing the steps in workflow YAML, which is more
visible in the GitHub UI and gives each step its own log, and which makes the
unattended path diverge from the path a person walks at 2 a.m. That divergence is
exactly the shape of the rollback failure this design exists to avoid.
`rollback.sh` is runnable by a human for the same reason the backup drill runs the
real `restore.sh`.

`deploy.sh` gains: a `--ci` flag (non-interactive, machine-readable output), a
guard that the checkout is on `main`, and the post-deploy health poll. Its
dump-before-pull, image tagging and revision recording are already correct and do
not change.

## Runner

- **CI stays on GitHub-hosted runners.** Only the deploy job carries the
  self-hosted label. The box never runs the test suite.
- **The repository must stay private.** GitHub warns against self-hosted runners
  on public repositories: a fork's pull request becomes code execution on the box.
- **`concurrency: { group: deploy, cancel-in-progress: false }`**, so two merges
  cannot deploy over each other.
- **The deploy takes the backup work's `flock`.** Those four jobs already share
  one lock; the deploy joining it means a deploy can never start mid restore-drill
  and a drill can never start mid-deploy. Serialisation by lock rather than by two
  people remembering.
- The runner runs as the user owning `~/anime_site`, in the `docker` group. It
  needs no root.

## Notification

GitHub's own notifications carry deploy failures and the Lane B approval request
to email and the GitHub mobile app, with full logs one tap away. No new
infrastructure.

GitHub cannot see one case: **the runner being offline when a merge lands.** The
job queues silently and the merge simply never deploys, which looks exactly like
success until somebody visits the site. Only something outside the box notices an
absence.

A dead-man's switch on the deploy job itself cannot cover this, and the reason is
worth stating so it is not re-attempted: Healthchecks fires when a ping does not
arrive **within an expected period**, and deploys are irregular by nature. There
is no period to configure, and a job that never started cannot ping.

So the fifth check is a **drift check, not a deploy check**. A daily systemd timer
on the box — beside the four the backup work installs, same `flock`, same
`.env.backup` — compares the deployed `git rev-parse HEAD` in `~/anime_site`
against `origin/main`:

- equal, or diverged for less than the grace window → ping success
- diverged for longer → ping `/fail` with both revisions

Its period is daily and regular, so the dead-man's switch works. It catches every
way a merge can fail to reach production — runner offline, job queued forever,
deploy silently failed, someone leaving the checkout on a detached HEAD — none of
which GitHub reports and none of which is visible from the site.

## What this does not protect against

- **A deploy that is wrong in a way the health check passes.** `/api/health`
  proves the app is up and the schema matches. It does not prove the feature
  works. The pull request's test suite covers that, and it runs before the merge.
- **Losing writes that landed between the pre-deploy dump and a tier 3 restore.**
  Unavoidable; the alternative is not restoring at all.
- **A migration that is wrong in a way nobody notices for a week.** That is the
  nightly off-box backup's problem, not this one.

**Expand/contract migrations** are the durable answer to all of Lane B: never drop
or rename in the same release that stops using a column, and old code always runs
against new schema, so rollback always works and the approval gate becomes
unnecessary. That is a discipline rather than a deliverable, so it is named here
and not built.

## Sequencing

**The off-box backup work lands first**, and its restore rehearsal must have
succeeded before the runner is installed.

The argument is not that this pipeline consumes those backups — `deploy.sh`
already takes its own pre-deploy dump, and the nightly jobs contribute nothing at
deploy time. It is that automating deploys raises the rate at which schema changes
reach production unattended, and a **verified** restore path should exist before
that happens. Today no restore on that box has ever succeeded.

Practical consequence: nothing from this project is installed or run in
`~/anime_site` until the backup work is off the box. This branch may be written,
tested and merged to `dev` before then — but a merge to `main` is what fires a
deploy, so `main` waits, and the runner is installed last.

## Testing

CI cannot exercise the box. Following the precedent of
`tests/unit/test_prod_compose.py`, structure is what is checkable and therefore
what is checked. `tests/unit/test_deploy_scripts.py`:

- Every script sets `set -euo pipefail` and every exit path reports.
- `deploy.sh --ci` refuses a checkout that is not on `main`.
- `rollback.sh` never issues `pg_restore` against production.
- `rollback.sh` sends an `irreversible` revision to tier 3 without attempting
  `downgrade`.
- The workflow's deploy step runs from `~/anime_site`, not the runner workspace.
- The deploy job carries the self-hosted label and the CI jobs do not.

Plus `tests/api/test_migration_round_trip.py` for the upgrade/downgrade/upgrade
walk, and API tests for `/api/health` — 200 when healthy, 503 with the database
down, and no detail in the unauthenticated body.

Written before the code, each failing first.

## Delivery

The owner does what cannot be automated:

1. **Register the runner** — `~/actions-runner`, a repo-scoped registration token,
   installed as a systemd service so it survives reboot.
2. **Create the GitHub Environment** with the protection rule that makes Lane B
   wait for approval.
3. **Add the fifth Healthchecks.io check** (the daily drift check), put its ping
   URL in `.env.backup` beside the others, and install the one extra timer with
   the same `sudo` script the backup work already delivers.
4. **A rehearsal**: merge a deliberately broken commit to `main` and watch the
   ladder catch it. Whatever that turns up is written into `deploy/README.md` as
   it actually ran.

## Documentation

- `deploy/README.md` — how a deploy now happens, and the ladder beside rollback.
- `docs/deployment-selfhost.md` — the healthcheck claim; deploys are automatic.
- `docs/notes/decisions.md` — this design's rejected alternatives.
- `docs/PROGRESS.md` — the stale `86982d71c2f1` line removed.
