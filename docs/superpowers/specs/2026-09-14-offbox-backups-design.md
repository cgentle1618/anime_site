# Off-box backups for the production box

Design, 2026-09-14. Build-order step 7 of `docs/deployment-selfhost.md` — the
last unbuilt piece of the self-hosted deployment.

## The problem

The only off-box copy of production data today is a Google Sheets Backup that a
person runs by hand from `/system`. It is genuinely off-box, so the database is
not one disk failure away from gone — but it is only as current as the last time
somebody remembered. The deploy dumps in `~/backups/` do not help: they live on
the same SSD as the database they protect.

Measured on the box, 2026-09-14:

| | |
| --- | --- |
| Database dump (`pg_dump -Fc`) | 1.6 MB |
| `static/covers/` | 283 MB, 1,986 files |
| `static/library/` | empty |
| Free disk | 83 GB |

## Two requirements that outrank the backup itself

1. **It proves itself by restoring, not by completing.** A backup that has never
   been restored is a guess. A documented rollback procedure on this box looked
   like it worked and did not — it restored old data under new code while the
   site stayed up and every row count came back correct.
2. **It reports its own failure.** A silent failure is worse than no backup,
   because it produces a false belief of coverage.

Requirement 1 is why the stamp and the weekly drill exist. Requirement 2 is why
every script is trap-wrapped and every job has its own dead-man's switch.

## What is protected, and what is not

| Store | Method | Frequency | Proof |
| --- | --- | --- | --- |
| Database | `pg_dump -Fc` copied to R2 | nightly | weekly restore drill, stamp asserted |
| `static/library/` | `rclone sync`, delta only | nightly | `rclone check` in the same job |
| `static/covers/` | `rclone sync`, delta only | weekly | `rclone check`, checksums from listings |
| Google Sheet | the app's existing Backup pipeline | nightly | **none — see the asymmetry below** |

Deliberately **not** protected:

- **`.env`, `credentials.json`, tunnel credentials.** The owner keeps these in a
  password manager. Backing up secrets to the same place as the data widens the
  blast radius of losing that place.
- **The OS and box configuration.** `docs/setup-selfhost.md` rebuilds it.
- **Docker images.** `deploy.sh` rebuilds them from git.
- **The repository.** It is on GitHub.
- **The R2 account itself.** This is a single off-box target. If the Cloudflare
  account is lost, the backup is lost with it. Stated rather than solved: a
  second provider is real work against a risk well below "the SSD dies".

### The asymmetry, stated so it does not become a false belief

**The dump is the backup of record. The sheet is a current, independent,
unverified second copy.**

The drill proves the dump restores. There is no equivalent for the sheet —
proving it would mean running Pull All into something, and the only honest check
available is that the pipeline reported success. The sheet's value is that it
sits at a different vendor, in a different format, behind a different
credential; automating it is what makes that value usable rather than stale.

## Shape

Host-side shell scripts driven by systemd timers. **Not** a pipeline inside the
application: the backup must work when the app is broken, and a broken app is
precisely when it is needed. It also keeps S3 client libraries out of the image.

```
deploy/backup/
  backup.sh     nightly:  stamp -> dump -> upload -> sync library -> prune -> ping
  sheets.sh     nightly:  call execute_backup() in the app container -> ping
  covers.sh     weekly:   sync static/covers/ -> rclone check -> ping
  verify.sh     weekly:   fetch from R2 -> restore.sh into a throwaway -> assert -> ping
  restore.sh    on demand: the one restore implementation, two callers
  install.sh    one-time:  the sudo script, handed to the owner
  units/        media-{backup,sheets,covers,verify}.{service,timer}
```

### Schedule

The box is `Asia/Taipei` and NTP-synced, so `OnCalendar` needs no conversion.

| Job | When | Why there |
| --- | --- | --- |
| `media-backup` | daily 04:00 | Owner's choice. Quiet window: the midnight cluster ends 00:20, `apt-daily` starts 06:10. |
| `media-sheets` | daily 04:10 | After the dump, so a corrupt night is already captured in R2 before the sheet is overwritten. |
| `media-covers` | Wed 04:20 | Away from `xfs_scrub_all`/`e2scrub_all` at Sun 03:10. |
| `media-verify` | Wed 04:40 | Verifies a dump hours old, not days. |

**Mid-week rather than weekend is deliberate.** A drill failing at 04:00 Sunday
puts an alert in front of the owner when they are least able to act, and it then
sits for two days.

**Every timer sets `Persistent=true`**, so a run missed while the box was off or
offline fires at the next boot rather than being lost. This is the reason for
systemd over cron: the box lives on a phone hotspot and is not always up.

**All four jobs share one `flock`.** After a multi-day outage `Persistent=true`
fires every catch-up run at boot simultaneously, and the drill could otherwise
start before the backup it is meant to verify has finished.

## The stamp

Immediately before the dump, one statement against production:

```sql
CREATE SCHEMA IF NOT EXISTS backup;
CREATE TABLE IF NOT EXISTS backup.stamp (
    id            int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    taken_at      timestamptz NOT NULL,
    git_revision  text NOT NULL,
    alembic_head  text NOT NULL
);
INSERT INTO backup.stamp (id, taken_at, git_revision, alembic_head)
VALUES (1, now(), :git_rev, (SELECT version_num FROM alembic_version))
ON CONFLICT (id) DO UPDATE
    SET taken_at = EXCLUDED.taken_at,
        git_revision = EXCLUDED.git_revision,
        alembic_head = EXCLUDED.alembic_head;
```

This is the one place the backup **writes to production**. One row, in its own
schema, touching nothing the application reads. `alembic/env.py` leaves
`include_schemas` at its `False` default, so `--autogenerate` cannot see the
table and cannot propose dropping it.

**Rejected: a JSON metadata file uploaded beside the dump.** It avoids writing to
production, and it does not work. A freshly generated metadata file can be paired
with a stale dump and the check passes. Only a stamp *inside* the dump proves the
dump is the one taken that night — which is the exact failure the rollback hit.

## The nightly run

```
04:00  flock -> stamp -> pg_dump -> upload -> sync library -> prune -> ping
                                                                  |
                                 any step fails ------------------+--> ping /fail
```

`set -euo pipefail` with an `EXIT` trap. **There is no path out of any script
that does not either report success or report failure.** The failure ping body
carries the last 20 lines of output, so the alert says what broke.

- **Dump.** `docker compose exec -T db pg_dump -Fc`, reusing `deploy.sh`'s
  empty-file guard — a truncated dump is worse than none because it looks like an
  option right up until it is needed. No downtime: `pg_dump` takes an MVCC
  snapshot and does not block writers.
- **Upload.** `rclone copyto` to `db/daily/media-<stamp>.dump`; on the 1st of the
  month a second copy to `db/monthly/`. `copyto`, not `sync` — each dump is its
  own object and sync would delete the previous ones.
- **Retention.** 30 daily, 12 monthly, pruned **in R2** so the policy lives in
  one place rather than half local and half remote.
- **`static/library/`** syncs with `--backup-dir` to a dated archive prefix, so a
  deletion is recoverable rather than propagated within 24 hours. It is then
  verified in the same run with `rclone check` — cheap, because the directory is
  small, and worth doing nightly because this is the one store nothing anywhere
  can re-fetch.
- **The local dump is deleted after a successful upload.** A nightly copy on the
  same SSD as the database is the reassurance this project is trying to stop
  relying on, and `deploy.sh` already keeps five pre-deploy dumps for rollback.

## The Sheets run

```bash
docker compose exec -T app python -c \
  "from app.database import SessionLocal; \
   from app.services.pipelines.backup import execute_backup; \
   execute_backup(SessionLocal(), 'Auto')"
```

`execute_backup(db: Session, action_type: str = "Manual")` is a plain synchronous
function — no `Request`, no HTTP, no auth — and `"Auto"` is already in use as an
`action_type` (`app/routers/_factory.py:112`).

**A separate timer and a separate check, never inside the nightly job.** Google's
API being down, or the `app` container being unhealthy, fails this job and leaves
the R2 backup untouched. Two jobs, two alerts, independent failure domains.

It runs **after** the dump because `execute_backup` overwrites every tab.
Automating removes the implicit human gate, so ordering it second means a corrupt
night is already captured in R2 first, and Google Sheets' own version history
holds the prior revision.

Pull All is untouched. It remains an admin button in the application.

## Restore: one implementation, two callers

```
restore.sh <dump> <target>
    |
    +-- weekly drill --> throwaway container   (automatic, no confirmation)
    +-- disaster     --> production            (human, explicit confirmation)
```

**The drill runs the same script a human would run at 2 a.m. with the SSD dead.**
A README procedure verified by a *different* piece of code is verified by
nothing — that is the shape of the rollback failure this design exists to avoid.
Every week the real path executes end to end.

The callers differ only in guards:

- Production requires explicit confirmation and prints what it is about to
  destroy, with row counts, first.
- Production is refused unless the `app` service is stopped. `app/main.py` calls
  `create_all` at import, so an app container racing the restore creates every
  table and makes `pg_restore` collide. `docs/notes/decisions.md` records this as
  learned the hard way; encoding it means it cannot be forgotten under pressure.
- The throwaway target takes no confirmation and is the drill's default.

**Nothing restores into production on a schedule, ever.** A scheduled job able to
overwrite the production database protects against nothing and risks everything.

## The weekly drill

```
Wed 04:40  fetch from R2 -> throwaway container -> restore.sh -> assert -> destroy -> ping
```

**It fetches from R2, not from disk.** The local dump was deleted after upload
precisely so the drill cannot test the wrong artifact. Downloading proves the
object exists, is readable with the credentials on the box, and survived
transfer — none of which a local test establishes.

**Isolation is by construction, not by care.** `docker run --rm --network none`
on a throwaway `postgres:17`: the container is incapable of reaching production
or anything else. A `trap` removes it on every exit path. A guard refuses to run
if the restore target name matches `$POSTGRES_DB`.

**Rejected: a scratch database inside the existing `db` container.** Cheaper, no
second container — and the only thing between that and a `--clean` against the
wrong database is a shell variable being correct. `--network none` is a stronger
guarantee than anyone's care.

### Assertions — any failure fails the run

1. **`pg_restore` produced no `ERROR` lines.** Exit code alone is insufficient;
   `pg_restore` can exit 0 with errors on stderr.
2. **The stamp is tonight's.** `backup.stamp.taken_at` within 48 hours, and
   `alembic_head` equal to the restored database's actual `alembic_version`.
   **This is the check the rollback needed and did not have.** A three-week-old
   dump restores perfectly and reports plausible row counts — and fails here,
   immediately, on a date.
3. **Schema completeness.** Every table the application declares is present, and
   the core tables (`users`, `role`, the media tables) are non-empty.

**Row counts are reported, not asserted.** The success ping carries them so week-
to-week shape is visible and a sharp drop is noticeable. They are deliberately
not pass/fail: counts are read just before `pg_dump` takes its snapshot, so a
write landing in that gap would fail the drill for no real reason. A backup
system that cries wolf gets ignored, which is its own silent failure.

**Covers are checked without downloading.** After the Wednesday sync,
`rclone check` compares local files to the bucket by checksum using hashes from
the listing — a few Class A operations, no 283 MB transfer. Any difference fails.

**What the drill does not prove:** that the application runs against restored
data. It verifies the data, not the system. That gap is closed once, by hand, in
the delivery rehearsal below.

## Alerting

| Check | Period | Grace | Fires when |
| --- | --- | --- | --- |
| `media-backup` | 1 day | 6 h | no successful nightly by 10:00 |
| `media-sheets` | 1 day | 6 h | no successful sheet write by 10:10 |
| `media-covers` | 1 week | 1 day | no successful cover sync by Thu 04:20 |
| `media-verify` | 1 week | 1 day | no successful drill by Thu 04:40 |

Four checks against a free limit of 20; 100 log entries each is roughly three
months of nightly history. Email notification is free — the paid credits are for
SMS and voice.

**A dead-man's switch rather than an error reporter**, because the two failure
modes need different mechanisms. A backup that runs and fails can shout on its
way out. A backup that **never ran** — box off, hotspot down, timer disabled —
cannot, because nothing executed. Only something outside the box notices an
absence. Failures are reported through the same channel so there is one thing to
watch.

**The grace window is sized for the hotspot.** A late boot with `Persistent=true`
firing the catch-up at 09:00 is normal operation; six hours absorbs it. A box off
for a full day is not normal, and alerts.

Each run pings `/start` on entry — which is what makes *duration* visible, so a
backup slowly getting slower is noticed before it starts timing out — then
success or `/fail` from the trap.

## Secrets

| What | Where | Mode |
| --- | --- | --- |
| R2 access key, secret, endpoint | `~/.config/rclone/rclone.conf` | 600 |
| Healthchecks ping URLs, bucket name | `~/anime_site/.env.backup` | 600 |

**Deliberately not in `~/anime_site/.env`.** `docker-compose.prod.yml:51` gives
the `app` service `env_file: .env`, so every variable there is injected into the
application container. Putting R2 write credentials in it would hand the web
application keys to the bucket holding its own backups.

**`.gitignore` needs a new line.** Line 3 is exactly `.env`, which matches only
that filename — **it does not match `.env.backup`**. That file lives inside a git
checkout on the box, so without this it is one `git add` from a committed R2
credential. Add `.env.backup` specifically, not `.env.*`, which would stop
ignoring and start hiding the tracked `.env.example`.

The R2 API token is scoped to Object Read & Write on the one bucket, not
account-wide.

## Cost

Cloudflare R2 free tier, verified 2026-09-14: 10 GB storage, 1,000,000 Class A
operations/month, 10,000,000 Class B, egress free on all storage classes.
`ListObjects` and `PutObject` are Class A; `GetObject` is Class B.

| | Us | Free tier | Used |
| --- | --- | --- | --- |
| Storage | ~360 MB | 10 GB | 3.6% |
| Class A / month | ~300 | 1,000,000 | 0.03% |
| Class B / month | ~4 | 10,000,000 | negligible |
| Egress | 1.6 MB / week | free | — |

Plus a one-time 1,986 PUTs on the first cover upload. `static/library/` would
have to reach ~9 GB before any of this mattered.

**Cloudflare is not the cost; the hotspot is.** That is why covers are weekly and
the dump is nightly: `rclone sync` avoids re-uploading unchanged files but must
still *list* the bucket to know that — roughly 1 MB nightly to learn nothing.
Steady state is ~1.7 MB/night, and the split matches sync frequency to what a
loss would actually cost. A cover up to seven days stale is an inconvenience and
is re-fetchable from the metadata APIs; a database seven days stale is not, and
`static/library/` is re-fetchable from nowhere at all.

## Testing

CI cannot run any of this — it needs a box CI cannot reach, an R2 bucket and a
Postgres container. That is the bind `tests/unit/test_prod_compose.py` is already
in, and its docstring frames the answer: structure is the only thing checkable
here, which is what makes it worth checking.

`tests/unit/test_backup_scripts.py` asserts the properties cheap to break and
expensive to notice:

- Every script sets `set -euo pipefail` and installs an `EXIT` trap that pings
  `/fail`.
- `verify.sh` contains `--network none` and the guard refusing a target equal to
  `$POSTGRES_DB`.
- `restore.sh` refuses a production target without confirmation and without the
  `app` service stopped.
- Every timer declares `Persistent=true`, and `OnCalendar` matches the schedule
  above.
- **The nightly does not sync covers and the weekly does.** That split is
  load-bearing for the data plan and nothing else would notice it reverting.
- `.env.backup` is ignored, asserted with `git check-ignore` — the outcome, not
  the configuration meant to produce it.

Written before the scripts, each failing first.

**`shellcheck` is added to `.github/workflows/ci.yml`.** It is not there today,
though `deploy.sh` carries `# shellcheck disable=` comments from a manual run.
This change takes the repo from one shell script to seven, and six of them run
unattended at 04:00 with nobody watching. Shellcheck is preinstalled on
GitHub's Ubuntu runners: one step, a few seconds, and it catches the
unquoted-variable class of bug that stays invisible until a path has a space.

## Delivery

The owner cannot hand over sudo, so anything needing root is packaged to be read
and run by them:

1. **One `sudo` script** — `apt install rclone shellcheck`, install the eight
   unit files, `systemctl enable --now` the four timers. Nothing else needs root.
2. **Two accounts** — a Cloudflare R2 bucket with a bucket-scoped API token, and
   a Healthchecks.io account with the four checks. Credentials pasted into the
   two 600 files.
3. **The first cover upload run by hand**, at a chosen moment, before the weekly
   timer is enabled. The 283 MB is a deliberate one-time cost and should not be
   something a timer spends at 04:00 on a hotspot.

### The acceptance test

Before this is called done: **a full manual rehearsal.** Pull a dump from R2 into
a scratch stack, bring the application up against it, and load the site. Not the
automated drill — the real path, walked end to end. Whatever it turns up is
written into `deploy/README.md` **as it actually ran**, not as designed here. The
rollback incident is the argument: the documented procedure was wrong in a way
only executing it revealed.

## Documentation

Changed in the same commits as the work:

- `docs/deployment-selfhost.md` — backups move out of "What is not done" into a
  section describing what runs. Bump `Last verified`.
- `deploy/README.md` — gains disaster recovery from R2, alongside rollback.
- `docs/setup-selfhost.md` — build-order step 7 becomes built.
- `docs/notes/decisions.md` — the decisions here, **including R2-as-backup-target
  and images-on-local-disk**, which `deployment-selfhost.md:528` currently claims
  are recorded there and are not.
- `docs/PROGRESS.md` — the task table.

## Out of scope

- **Backing up secrets.** The owner's password manager.
- **A second backup provider.** One off-box target is the accepted risk.
- **Automating restore into production.** Never on a schedule.
- **The dev handover sheet.** `CLAUDE.md` notes it holds exactly one version of
  the data, so there is a genuine single-copy window between a Backup on one
  machine and a Pull on the other. That is a development-workflow risk, not a
  production-box one, and wants its own conversation rather than being smuggled
  in here.
