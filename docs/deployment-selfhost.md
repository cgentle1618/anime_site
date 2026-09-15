# Production: the self-hosted box

Last verified: 2026-09-15 (the application is deployed and serving at
`media.cg1618.com`)

**What this is.** The application runs on an HP ProDesk 600 G4 Desktop Mini at
home, under Ubuntu Server, in three Docker containers, reached from the Internet
through a Cloudflare Tunnel. No inbound port is opened anywhere.

**The three deployment documents, and which to read:**

| | |
| --- | --- |
| **This file** | What is running and how it behaves. Read it to understand the system. |
| [setup-selfhost.md](setup-selfhost.md) | How to build one from an unopened box. Read it once. |
| [deploy/README.md](../deploy/README.md) | How to deploy and roll back today. Read it every deploy. |

Why the system is shaped this way — the decisions and the alternatives that were
rejected — is [notes/decisions.md](notes/decisions.md).


## The decision

| Question | Answer | Why |
| --- | --- | --- |
| Where does it run? | A dedicated 1 L x86 mini PC at home, on all the time | The app is small — FastAPI + one Postgres + a static bundle, idle RAM well under 1 GB. A laptop works but is not meant to be a server. |
| Which box? | **HP ProDesk 600 G4 Desktop Mini** — i5-8500T, 16 GB, 512 GB SSD. Bought used, NT$5,680. | x86, so every Docker image works unmodified (no arm64 surprises). Six cores and 16 GB leave room for the other small projects this box is meant to absorb. |
| Why used? | New was worse value in 2026 | DRAM and NAND are in a historic spike — DDR5 up 400-500% year-over-year, NAND roughly doubled. A *new* N150 box with 16 GB / 256 GB was NT$12,990-19,825, more than double this machine's price for less CPU. Buying used bought the RAM and SSD at pre-spike prices. |
| How is it reached? | **Cloudflare Tunnel** (`cloudflared`) | Outbound-only connection, so no port forwarding, no static IP, and it works even behind CGNAT. Free HTTPS, and the home IP is never exposed. |
| Under what name? | **`cg1618.com`**, bought through Cloudflare Registrar — see [The domain](#the-domain) | The DNS has to live at Cloudflare for the tunnel anyway, and Cloudflare sells at cost with no renewal markup. One domain covers every project via subdomains. |

Raspberry Pi, NAS, VPS and a new N100/N150 mini PC were all considered and
rejected during the survey; a VPS at ~US$5-7/month remains the honest fallback
if home hosting turns out to be a chore. **That comparison is closed — this
file is now about building on the machine that exists.**

## The machine

**HP ProDesk 600 G4 Desktop Mini**, bought used 2026-09-08 from Better 3C
二手倉庫 (高雄) via [Shopee](https://shopee.tw/product/7123416/22021629456) for
**NT$5,680**, 免運, 蝦皮安心退.

| | |
| --- | --- |
| **CPU** | Intel Core i5-8500T — 6C/6T, 2.1 GHz base / 3.5 GHz turbo, 35 W TDP, Coffee Lake, UHD 630 |
| **RAM** | 16 GB DDR4 SO-DIMM as **2 × 8 GB, both slots occupied** — Kingston `9905700-012.A00G`, DDR4-2667 running at its rated 2667, dual channel (DIMM1 on channel B, DIMM3 on channel A). Official maximum is 32 GB, so that upgrade **replaces both sticks** rather than adding one. |
| **Storage** | 512 GB **SATA** SSD — Transcend `TS512GSSD370S`, 477 GB usable, on the DM SATA connector. **Not NVMe**, so it appears as `/dev/sda` under Linux and tops out around 550 MB/s. |
| **Storage expansion** | 2× M.2 PCIe x4 (2280/2230). The boot SSD is on the DM SATA connector, so both should be empty — not confirmed, since the case has not been opened |
| **WLAN slot** | 1× M.2 PCIe x1 2230, holding an Intel **Dual Band Wireless-AC 8265** (WiFi MAC `F8-34-41-B1-EF-E5`, Bluetooth on the same card) |
| **Network** | Intel **I219-LM** Gigabit Ethernet (1× RJ-45), MAC `B0-5C-DA-34-A2-0C` |
| **Video** | 2× DisplayPort 1.2 + one configurable port; a DP→HDMI adapter was included |
| **USB** | 3× USB 3.1 Gen 1, 3× USB 3.1 Gen 2, 1× USB 3.1 Gen 2 Type-C (front) |
| **Other** | Optional RS-232 serial (rear), headphone jack, front combo audio |
| **Chassis** | 1 L Desktop Mini |
| **Shipped with** | 原廠變壓器, 滑鼠, DP→HDMI 轉接頭, internal WiFi card, Windows 10 Pro |

The Windows licence is irrelevant — this box runs Linux. The proprietary
barrel-plug 變壓器 being included is the accessory that actually mattered;
these are awkward to replace.

### Condition of the drive

The SSD is used and holds the only copy of `static/library/`, so its wear
numbers are the ones worth keeping. Read with CrystalDiskInfo:

| | |
| --- | --- |
| Health / temperature | 良好 **97 %**, 25 °C idle |
| Power-on hours | **4,325 h** — roughly six months of continuous use, far short of the ~20,000 h that marks a well-used drive |
| Power cycles | 1,049 |
| Host writes / NAND writes | 21,610 GB / 55,150 GB (write amplification ≈ 2.6) |
| Reallocated sectors, uncorrectable errors | **0 / 0** |
| Firmware | O0919A |

This is the baseline to compare later readings against; the same numbers in
`smartctl` form are taken in [step 9](setup-selfhost.md#step-9--finish-the-hardware-checks).

### Firmware and disk state as delivered

- **SATA mode is already AHCI** (`Intel(R) 300 Series Chipset Family SATA AHCI
  Controller`), not RAID / Intel RST, so the change in
  [step 3](setup-selfhost.md#step-3--bios-settings) is a confirmation rather than an edit.
- **Virtualisation (VT-x) is enabled** in firmware.
- **Serial `8CC0201TF9`**, **product number `2YE28AV`** — the product number is
  what HP's support and spare-parts lookups want. The chassis label and
  `Win32_BIOS` report the same serial, so the board is the one the case was
  built with. `AV` marks a configure-to-order unit, which is why the memory is
  Kingston rather than HP-branded.
- **BIOS `Q22 Ver. 02.35.00`, dated 2026-07-28 — the current release.** HP lists
  02.35.00 (SoftPaq Rev.A) for this product number, so the machine is already
  on the latest firmware and **nothing needs flashing**. Should a later release
  ever matter, do it from the bundled Windows: HP ships these as a Windows
  `.exe`, and from Linux it means `fwupd` or a bootable updater.
- **PSU** — the genuine HP brick, 19.5 V, as listed.
- **Warranty expired.** The label reads 3y/3y/3y from original purchase, so the
  seller's return window is the only remedy there is.
- The disk carries an EFI system partition (0.3 GB), `C:` (250 GB) and `D:`
  (226.6 GB), and **nothing else — no HP recovery partition**. `D:` holds only
  an empty recycle bin, so the whole disk can be given to the installer with
  nothing to preserve.

**What to do with it** is [setup-selfhost.md](setup-selfhost.md)
below — the inspection comes first, in the Windows it ships with, and the
Windows licence stops mattering after that.

## How it runs

One Compose project, `media`, defined by `docker-compose.prod.yml` at the
repository root, from a git checkout at `~/anime_site` on the box.

**That checkout tracks `main`.** `deploy.sh` pulls whatever branch is checked
out rather than naming one, so this is what decides that production runs
released code: work reaches `dev` by pull request and reaches the box only
after a release pull request promotes `dev` to `main`.

| Service | Image | What it is |
| --- | --- | --- |
| `db` | `postgres:17` | The database. Data in the named volume `media_pgdata`. |
| `app` | `media-app:local`, built on the box from `dockerfile` | FastAPI and the built SPA, one process, `uvicorn` on port 8000. |
| `cloudflared` | `cloudflare/cloudflared:latest` | The outbound tunnel, and the only way in. |

Compose derives container names from the project, so they are `media-db-1`,
`media-app-1` and `media-cloudflared-1`. Nothing hardcodes a container name —
the project name is the one place a name is written.

### Nothing publishes a port

No service has a `ports:` entry. The database is not on the LAN, the app cannot
be reached except through Cloudflare, and there is no open port to
misconfigure. To reach PostgreSQL from a laptop, forward it over SSH:

```bash
ssh -L 5433:localhost:5432 homelab    # then psql -h localhost -p 5433
```

`tests/unit/test_prod_compose.py` fails if a `ports:` entry appears.

### A volume for the database, bind mounts for the images

The database lives in a **named volume** (`media_pgdata`) because nothing
outside PostgreSQL should be reading those files, and because a volume survives
`docker compose down` while a container does not.

`static/covers/` and `static/library/` are **bind mounts** into the checkout, so
`rsync`, `tar` and any future backup see ordinary files on disk. That matters
most for `static/library/`: covers can be re-fetched from the metadata APIs if
they are ever lost, and uploaded images cannot. They are not in the image
either — `.dockerignore` excludes both, or every build would copy the whole
library in.

### The project name decides which database you see

`COMPOSE_PROJECT_NAME=media` in the box's `.env` is load-bearing. Compose
otherwise derives the project name from the directory and prefixes volumes with
it, so a checkout moved or cloned under another name comes up on a brand-new
empty volume — and the application cheerfully creates a schema and seeds a
fresh admin while the real data sits untouched in the old volume. It looks
exactly like data loss without being it.

The development machines pin `anime_site` for the same reason and must keep it.

### The compose file sits beside the `.env` it reads

`docker-compose.prod.yml` is at the repository root, not in `deploy/`, because
Compose takes its project directory from the compose file's own location and
loads `.env` from there. Under `deploy/` it looked for `deploy/.env`, found
nothing, and interpolated every `${...}` to an empty string — while `env_file:`
kept working, so the application was configured correctly and only the database
came up wrong. A test pins the location.

It does not collide with `docker-compose.yml`, which is the development file
running a bare PostgreSQL: Compose only auto-loads that name, so production is
always explicit behind `-f`.

### Migrations run on every start

`entrypoint.sh` runs `alembic upgrade head` and then `uvicorn` with
`--proxy-headers --forwarded-allow-ips='*'`, which is what a tunnel needs. So
starting the app is also migrating the database — convenient, and the reason
every deploy takes a dump first.

`app` waits for `db` to pass a `pg_isready` healthcheck before it starts.
Without that, a boot where PostgreSQL is slower than the application makes the
application crash-loop through Alembic until it wins.

**`app` is probed on `/api/health`, and the path matters more than the probe.**
The catch-all route serves the SPA for any path, so a check against `/` passes
with the database completely down — a healthcheck that lies is worse than none,
which is why this service went without one until an honest probe existed.
`/api/health` opens a database session, reads `alembic_version`, and compares it
to the head the running code expects, so it fails both when the database is gone
and when the schema and the image disagree. The second is the state a
half-rolled-back deploy leaves behind, where the site still serves pages and
every weaker probe passes.

### Where the secrets are

Nothing secret is in git. On the box:

| | |
| --- | --- |
| `~/anime_site/.env` | Everything the containers read. Mode 600, gitignored. |
| `~/.cloudflared/<uuid>.json` | Tunnel credentials, the copy the CLI uses. |
| `~/.cloudflared/credentials.json` | The same secret, owned by uid 65532 so the container can read it. |
| `~/backups/` | Deploy dumps, the last five. |

The two credential files exist because Cloudflare's image runs as the `nonroot`
user and cannot read a 600 file owned by anyone else. Each copy is owned by its
consumer and both stay 600.

## How it recovers

The box lives on a connection that comes and goes, so recovering without a
human is a requirement rather than a nicety. Every link in that chain is
deliberate, and each was tested rather than assumed.

| If this happens | What brings it back | Measured |
| --- | --- | --- |
| Mains power cut | BIOS **After Power Loss → Power On** | Comes up unattended |
| Boot | `docker.service` enabled; `restart: unless-stopped` on all three | **23.6 s** from power-on to serving |
| The network disappears and returns | `wpa_supplicant` reassociates; DHCP renews | Same address recovered, unattended |
| The tunnel drops | `cloudflared` retries its outbound connection indefinitely | Four QUIC connections re-registered |
| A container exits | `restart: unless-stopped` | — |
| The app container is replaced | `cloudflared` re-resolves the service name | Verified across a rebuild |

`restart: unless-stopped` rather than `always`, so a deliberate
`docker compose stop` survives a daemon restart instead of fighting you.

**Two settings quietly undo this if they are wrong.** `S5 Maximum Power
Savings` in the BIOS cuts power to devices in soft-off and breaks power-on
after loss; and on a WiFi box `iwlmvm`'s default power scheme idles the radio
hard enough that a local ping runs around 200 ms instead of 1-3, which presents
as an unreachable machine rather than a sleeping radio.

**The boot time is a setting, not a property.** The installer's netplan makes
`systemd-networkd-wait-online` block on the Ethernet interface, which never
comes up without a cable; it waits its full two-minute timeout, fails, and
`docker.service` waits behind it. Marking that interface `optional: true` took
startup from **2 min 18 s to 23.6 s** and left `systemctl --failed` empty
instead of permanently showing one failure — the second mattering more, because
a box that always shows a failure teaches you to skim past the command you
would use to find a real one.

## Backups

Four systemd timers, all on the box and all sourcing `deploy/backup/lib.sh`,
serialise on one `flock` so two never run at once:

| Job | Schedule (Asia/Taipei) | Script | Does |
| --- | --- | --- | --- |
| `media-backup` | daily 04:00 | `backup.sh` | Stamps the database, `pg_dump`s it, uploads to R2, mirrors `static/library/`, prunes old dumps |
| `media-sheets` | daily 04:10 | `sheets.sh` | Runs the application's own Google Sheets Backup pipeline |
| `media-covers` | Wed 04:20 | `covers.sh` | Syncs `static/covers/` (283 MB) to R2 |
| `media-verify` | Wed 04:40 | `verify.sh` | Restores the newest R2 dump into a throwaway container and asserts it |

`media-sheets.service` and `media-verify.service` both declare
`After=media-backup.service` with no `Requires=` — ordering without coupling,
so a night `media-backup` fails still runs the other two and still reports to
their own alert, rather than one failure silently cancelling jobs that do not
depend on it.

**R2 layout**, one bucket:

```
db/daily/       nightly pg_dump, one object per run, 30-day retention
db/monthly/     the 1st-of-month dump, kept 12 months
library/        mirror of static/library/
covers/         mirror of static/covers/ (weekly)
_archive/       rclone --backup-dir target: anything a sync would delete
                lands here instead, under the run's timestamp
```

Retention (30 days, 12 months) is enforced in R2 by `rclone delete --min-age`,
not locally, so it lives in one place. It is a window, not a count — a box
that has been off for a week holds fewer than 30 dailies, not exactly 30.

**The stamp.** Every dump carries a `backup.stamp` table, written into the
database (not beside it as a separate file) so it travels inside the `.dump`
and cannot pair a fresh timestamp with a stale backup. It records when the
dump was taken, the git revision and Alembic head at that moment, and the
full list of `public` tables read from `pg_tables` — what production actually
had, not what the models say it should have, so a partial dump shows up as a
missing table name with no live app container required to detect it.

**The weekly drill (`media-verify`)** is what makes the backup provable rather
than assumed: it downloads the newest dump from R2, restores it with
`restore.sh` — the same script a person runs by hand in a disaster, not a
reimplementation of it — into a `postgres:17` container started with
`--network none`, and asserts three things: the stamp is under 48 hours old
and its Alembic head matches the restored `alembic_version`; the restored
table set matches `backup.stamp.source_tables` exactly; and `users` and
`role` each restore non-empty. Row counts for every table are reported in the
success ping, not asserted — they are read just before the dump's snapshot,
so a write landing in that gap would fail the drill for no real reason.

**What a green `media-verify` does not mean.** It compares table *names*
against `backup.stamp.source_tables`, not row counts, so a table that restored
empty still passes — `users` and `role` are the only two whose contents are
checked. And the freshness assertion is a 48-hour window, so a green drill on
Wednesday is compatible with Wednesday's own backup having failed: it only
proves a dump from the last two days restores. That night's failure is
`media-backup`'s alert to raise, not the drill's. Both are deliberate — a
stricter drill would cry wolf on ordinary writes and on a box that was off
overnight — but a green drill is evidence about the restore path, not a
statement that every table and last night's run are fine.

**Alerting.** Each job pings its own Healthchecks.io dead-man's switch —
`/start` on entry, success or `/fail` from an `EXIT` trap — using the
**OnCalendar** schedule type (not Simple), so the alarm is anchored to wall-clock
time rather than drifting later after every late run:

| Check | Grace | Fires when |
| --- | --- | --- |
| `media-backup` | 6 h | no successful nightly by 10:00 |
| `media-sheets` | 6 h | no successful sheet write by 10:10 |
| `media-covers` | 1 day | no successful cover sync by Thursday 04:20 |
| `media-verify` | 1 day | no successful drill by Thursday 04:40 |

A dead-man's switch rather than an error reporter, because a job that never
ran — box off, hotspot down, timer disabled — cannot report anything on its
own; only something outside the box notices the absence.

**A job that fails before it has loaded its configuration cannot ping either**,
and this is the backstop for that too. The `EXIT` trap that reports success or
failure is installed by `start_job`; a missing `.env` or `.env.backup`, a
variable that is unset or empty, or a lock still held after an hour all end the
run before that point — and in the `HC_*_URL` case the ping URL is the very
thing that is missing. Such a run therefore shows up as a **missed** check at
the end of the grace window, not as a failure alert, with the reason in
`journalctl -u <unit>`. `load_backup_env` makes that reason legible — it
refuses with a message naming the missing variable rather than aborting on
`unbound variable` — but the absence, not the alert, is what is visible from
outside.

**The asymmetry, stated so it cannot become a false belief.** The `pg_dump` in
R2 is the backup of record, and it is the only one of the two off-box copies
that is restore-verified, every week, by `media-verify`. The Google Sheets
Backup that `media-sheets` runs nightly is a current, independent second copy
of the same data — but nothing restores it and checks the result. Its only
verification is that the pipeline itself reported success. Reasoning about
recoverability from the sheet as if it carried the same guarantee as the R2
dump is wrong.

Why R2 rather than the sheet as the backup of record, why images stay on local
disk instead of object storage, and the rest of this design's reasoning is
[notes/decisions.md](notes/decisions.md#off-box-backups-spec-2026-09-14-offbox-backups).
Restoring from R2 in an actual disaster is
[deploy/README.md](../deploy/README.md#disaster-recovery-from-r2).

## Deploying, and what CI does

**CI deploys nothing.** `.github/workflows/ci.yml` runs ruff, pytest, eslint,
vitest and the frontend build on every pull request and on pushes to `main`. It
has no deployment job and no credentials for this box. The pull request is the
gate; nothing reaches the box automatically.

**A deploy is a person running one script on the box:**

```bash
cd ~/anime_site && ./deploy/deploy.sh
```

which dumps the database, records the revision that dump belongs to, tags the
outgoing image `media-app:previous`, pulls, rebuilds and restarts.

**It does not reinstall the systemd units and does not write `.env`.** A change
under `deploy/backup/units/` arrives in the checkout while the running timers
keep the old definition, silently — re-run `sudo ./deploy/backup/install.sh`
after one. A change needing a new environment variable needs it added by hand.
Both are in [deploy/README.md](../deploy/README.md#what-a-deploy-covers).

**The box builds its own image** rather than pulling one from a registry.
Building in CI and pulling from GHCR is the conventional answer and stays
available — the compose file already names the image, carries no build args and
bakes in no environment-specific values, so the switch is about two lines. It
is not done because CI would then build a multi-stage image on every pull
request to serve a box one person deploys by hand.

**The dump before the pull is the only protection against a bad migration.**
Migrations run on every start, so by the time one is visible it has already
happened, and `alembic downgrade` is not a restore: reversing a dropped column
recreates it empty. Rollback is three steps and the third must rebuild —
`git checkout` reverts the source, but the code the container runs is baked into
its image. The procedure is in [deploy/README.md](../deploy/README.md).
## Storage

### How much is actually needed

Measured on the company machine, 2026-09-08:

| Component | Size | Detail |
| --- | --- | --- |
| Cover images (`static/covers/`) | **235 MB** | 1,883 files, gitignored, local-only |
| Uploaded images (`static/library/`, including `static/library/thumbs/`) | not yet measured | grows with every upload, unlike the cover directories above; the totals below are a floor, not a fixed figure |
| Postgres (`anime_site_db`) | **23 MB** | whole database including indexes, ~11,000 rows |
| Application code (`app/`, `alembic/`, `tests/`, `docs/`) | **22 MB** | what actually ships |
| Built frontend (`frontend_dist/`) | 1.9 MB | regenerated by `npm run build` |
| **Total to host** | **≈ 280 MB, plus whatever `static/library/` has grown to** | |

The 640 MB the working tree occupies on a dev machine is mostly `venv/`
(187 MB), `frontend/node_modules/` (184 MB) and `.git/` (12 MB), none of which
travel to a container.

**The 512 GB SSD holds this roughly 1,800 times over.** At ten times the
current collection — 20,000 entries — covers would reach about 2.5 GB and the
database about 250 MB. Storage capacity will not be a constraint on this
machine, and the two M.2 slots mean it could not become one without plenty of
warning — an NVMe drive added there would also be considerably faster than the
SATA disk the box boots from.

This is also why the box was chosen for RAM rather than capacity: memory
decides how many apps share it, and at 2026 prices it is the one spec that is
ruinous to add later. Both SO-DIMM slots being full makes that sharper still —
going to 32 GB buys 2 × 16 GB and throws away the pair already fitted.

### One outlier worth knowing about

Comic covers are 128 MB across only 99 files — over half the entire image store
— averaging ~1.3 MB each, while anime covers average ~42 KB:

```
comic         128 MB     99 files    ~1.3 MB each
anime          31 MB    747 files     ~42 KB each
movie          30 MB    342 files
tv-show        18 MB    198 files
cartoon        12 MB    127 files
manga         8.3 MB    193 files
game          7.0 MB     98 files
novel         2.1 MB     47 files
anime-movie   1.2 MB     32 files
```

Comic Vine returns full-resolution scans and nothing downsizes them on the way
in. Resizing just those would cut the image store by ~45%. Not worth doing for
space, but it is why the comic library will feel slowest over the tunnel, and
it is what grows fastest as comics are added.

### Backups are what made capacity not a risk

280 MB is small enough that a complete off-box copy is trivial — comfortably
inside Cloudflare R2's free tier even as `static/library/` grows with every
upload in a way the cover directories do not. See [Backups](#backups) for the
schedule, and [notes/decisions.md](notes/decisions.md#off-box-backups-spec-2026-09-14-offbox-backups)
for why R2 and not something else.

The two image directories are not equally recoverable, which is why one syncs
nightly and the other weekly. A missing cover is an inconvenience —
`download-missing-covers` re-fetches it from MAL, TMDB, Comic Vine and
friends — so `static/covers/` syncs weekly. A missing uploaded image is
permanent: nothing re-fetches it, uploads never travel through the Google
Sheets Backup/Pull pipeline (which carries the reference, not the bytes), and
`static/library/` is the only copy anywhere — so it syncs every night,
alongside the database dump.

## Running cost

An i5-8500T in a 1 L chassis should idle around 8-12 W, so roughly
**6-9 kWh/month**, or **NT$25-40/month** in electricity. Add `cg1618.com` at
US$10.46/year (~NT$330, rising to ~NT$350 in November 2026). Cloudflare Tunnel
itself is free at this scale.

Against the one-off NT$5,680, the whole arrangement pays for itself versus a
paid cloud runtime within months, which was the point of the exercise.

## Networking

The hardware is the easy half. Residential networking in Taiwan is where this
usually goes wrong, so the tunnel is not an optional convenience — it is what
makes the plan work regardless of which ISP is in front of it.

**Cloudflare Tunnel (chosen).** `cloudflared` runs on the mini PC and dials
*out* to Cloudflare; a hostname on a domain whose DNS sits at Cloudflare is
routed down that connection to the local uvicorn port. Consequences:

- No router port forwarding, no static IP, no DDNS.
- Works behind CGNAT — relevant if the connection is 凱擘 / 台灣大寬頻 cable
  rather than 中華電信 光世代 fibre.
- TLS terminates at Cloudflare, so the app is served over real HTTPS without
  managing certificates. **This matters for the cookie behaviour described
  below.**
- The home IP address is never published.
- Cloudflare Access can later gate the admin routes with a second login layer
  independent of the app's own JWT auth.

### The domain

**`cg1618.com`, to be registered through Cloudflare Registrar.** Not yet
purchased as of 2026-09-08.

| | |
| --- | --- |
| **Name** | `cg1618.com` — availability confirmed 2026-09-08 against Verisign's RDAP server |
| **Registrar** | [Cloudflare Registrar](https://dash.cloudflare.com) → Domain Registration → Register Domain |
| **Price** | **US$10.46/year** (~NT$330), at cost — registry fee plus the US$0.18 ICANN fee, no markup, and renewal is the same price |
| **WHOIS privacy** | Included free. Without it the registrant name, home address and phone number are public. |

Registering *at* Cloudflare means the zone is created with Cloudflare
nameservers already in place — there is no delegation step and no propagation
wait. Later, `cloudflared tunnel route dns <tunnel> <hostname>` writes the CNAME
itself, so DNS records are never hand-edited.

**Note the 1 November 2026 price change.** Verisign is raising the wholesale
`.com` fee, taking Cloudflare's price to US$11.15 (~NT$350). Registering before
then locks the lower rate for that year. Immaterial in absolute terms; worth
knowing so the renewal invoice is not a surprise.

**One domain, one subdomain per project.** This box is meant to absorb other
small projects, and they do not need domains of their own — all of them are
subdomains routed by the single `cloudflared` daemon to different local ports
(see [Planned hostnames](#planned-hostnames)). The ~NT$330/year is a one-time
cost for everything hosted here, which is why a short, project-neutral name was
chosen over an anime-specific one.

`cgentle1618.com` (matching the GitHub handle) was also free and was
considered; `cg1618` won on length, since this string ends up in SSH configs,
`.env` files and tunnel config for years. Both remain free if the twin is ever
wanted as a defensive registration.

### Planned hostnames

Seven personal projects are intended for this box. **Only the media tracker
exists** — everything else is a name reserved on paper so the scheme stays
consistent as they appear, and so no two projects collide on a port.

| App | Hostname | Port | Status |
| --- | --- | --- | --- |
| Media tracker (this repo) | `media.cg1618.com` | 8000 | **being built** |
| Drawing — notes, practice tracker | `art.cg1618.com` | 8001 | planned |
| Food — recipes, ingredients, restaurants, cook schedule | `food.cg1618.com` | 8002 | planned |
| Journal | `journal.cg1618.com` | 8003 | planned |
| Health records and tips | `health.cg1618.com` | 8004 | planned |
| Accounting | `money.cg1618.com` | 8005 | planned |
| Travel — packing, transport, notes | `travel.cg1618.com` | 8006 | planned |
| *(landing page or redirect, undecided)* | `cg1618.com` (apex) | — | reserved |

The resulting `cloudflared` ingress, once there is more than one:

```yaml
ingress:
  - hostname: media.cg1618.com
    service: http://localhost:8000
  - hostname: art.cg1618.com
    service: http://localhost:8001
  # ...
  - service: http_status:404   # required catch-all, must be last
```

#### Why these names

- **One word, one level deep.** Cloudflare's free Universal SSL covers
  `*.cg1618.com` but not `*.*.cg1618.com`, so `dev.media.cg1618.com` would need
  paid Advanced Certificate Manager. Keep every hostname a single label.
- **Named for the domain, not the feature set.** `food` rather than `recipes`,
  because that project already spans restaurants, ingredients and a cook
  schedule; `art` rather than `drawing-notes`. Each project is going to grow
  past its first idea, and a hostname is the most awkward thing to rename —
  it is in bookmarks, cookies and tunnel config.
- **`money` over `accounting`** on length alone; it is typed often and means
  the same thing here.
- No hyphens, no digits, all lowercase.

#### Keep these free

Do not give an app a name that infrastructure may want later:

`www`, `api`, `mail`, `smtp`, `ns1`, `admin`, `status`, `dev`, `staging`, `vpn`

`www` in particular buys nothing — it would just double the hostnames that have
to keep working.

#### Sensitivity: not every app should be publicly reachable

The media tracker is a catalogue; the worst case for a leak is embarrassment.
**`journal`, `health` and `money` are a different class of data**, and they will
be sitting on a home machine behind a JWT-in-a-cookie and one admin password.

Before any of those three is exposed, decide between:

1. **Cloudflare Access in front of the hostname** — a second, independent login
   (Google account, email OTP) that runs at Cloudflare's edge, so unauthenticated
   traffic never reaches the box at all. Free at this scale, and it works
   regardless of what the app's own auth does.
2. **No public hostname at all** — reach them over Tailscale or the LAN and give
   them no tunnel ingress. Strictly safer; less convenient from a phone.

This is not a decision for today, but it is one to make *before* writing the
ingress rule, not after. The tracker does not need it — same tunnel, same box,
different exposure.

Give the box a **DHCP reservation** on the router anyway. The tunnel does not
need a fixed LAN address, but SSH and `psql` from a laptop do.

**Rejected: port forwarding + DDNS.** 中華電信 光世代 PPPoE usually does hand
out a real (dynamic) public IPv4, so forwarding 80/443 plus DuckDNS or
Cloudflare DDNS and terminating TLS with Caddy or nginx would work. Rejected
because it publishes the home IP, breaks if the ISP ever moves the line behind
CGNAT, and residential terms of service discourage it.

**Rejected: Tailscale Funnel.** Simplest of all to set up, but modest
throughput and a `*.ts.net` hostname. Fine for one person; not for something
meant to look like the site as it was.

## The code that self-hosting needed

All of it is done, by deletion rather than by adding configuration. The record
of what was removed is [deployment-gcp.md](deployment-gcp.md).

- **`APP_ENV` names the runtime** and defaults to **production** when unset, so
  a box never told what it is gets the hardened behaviour rather than the lax
  one. It drives the login cookie's `Secure` flag. See
  [authentication.md](authentication.md#the-production-signal-app_env).
- **`Settings.validate_secrets()` refuses to start** on a default
  `JWT_SECRET_KEY` or `ADMIN_PASSWORD`, in every environment and deliberately
  **not** gated on `APP_ENV`. One variable gating both protections is one thing
  you can forget, and forgetting it would disable the secret check as well as
  the cookie flag. Django splits them the same way.
- **`DATABASE_URL` is honoured verbatim** when set. The old "ignore a localhost
  URL" guard is gone, which is what lets the container point at `db:5432` — and
  is why a stale value copied from a development machine breaks a box silently.
- **Covers are local on both sides.** `image_manager.py` writes and reads
  `static/covers/<owner_type>/<system_id>.jpg` with no bucket branch, and
  `getCoverUrl` returns `/static/covers/<file>` on every host. Behind the tunnel
  they resolve from the same origin as the app.

**One thing is deliberately unchanged.** `getQuoteImageUrl` still checks
`isLocalHost()` and returns `null` elsewhere, a gate that existed because Cloud
Run's filesystem was ephemeral and uploads vanished on restart. That reasoning
does not apply to a box with a persistent disk, so quote images could simply
work — but the gate was left rather than removed blind.

## What is not done

- **A DHCP reservation**, which is impossible while the box lives on a phone
  hotspot. Its address is whatever DHCP hands out, and `ssh` failing is the
  signal that it moved.
- **The cable handover** — when Ethernet arrives, the reservation moves to the
  Ethernet MAC, the `wifis:` block comes out of the netplan file, and the
  `iwlwifi` power-save override is deleted with it.
- **Whether `journal`, `health` and `money` get Cloudflare Access** or no public
  hostname at all. None of them exists yet, and the decision belongs before the
  ingress rule rather than after — `tests/unit/test_prod_compose.py` fails if
  one of them is routed, as the reminder.
- **What the apex `cg1618.com` serves** — a landing page linking the projects,
  or a redirect to one of them.
- **Whether `getQuoteImageUrl` is fixed** now that the disk is persistent.

## See also

- [setup-selfhost.md](setup-selfhost.md) — how this box was built, step by step.
- [deploy/README.md](../deploy/README.md) — deploying and rolling back.
- [notes/decisions.md](notes/decisions.md) — why it is shaped this way, and the
  alternatives that were rejected.
- [deployment-gcp.md](deployment-gcp.md) — the deployment this replaces.
- [setup-local.md](setup-local.md) — local development, unaffected.
- [external-apis.md](external-apis.md) — Sheets and the metadata APIs.
