# Deployment (self-hosted HP ProDesk 600 G4 mini + Cloudflare Tunnel)

Last verified: 2026-09-08 (commit 2b28258)

> ## Status: hardware bought, nothing deployed yet
>
> **The machine is purchased** — an HP ProDesk 600 G4 Desktop Mini, bought
> 2026-09-08 for NT$5,680 (see [The machine](#the-machine)). Everything else in
> this file is still ahead: no OS is installed, no production
> `docker-compose.yml` exists, and none of the code changes under
> [What has to change in the code](#what-has-to-change-in-the-code) have been
> made.
>
> This is the replacement for the GCP deployment that went down on 2026-09-02
> (see [deployment-gcp.md](deployment-gcp.md)). The shape is settled: **an
> always-on 1 L x86 mini PC at home, reached from the Internet through a
> Cloudflare Tunnel.** Hardware alternatives are closed — do not reopen them.

**What this is for.** Where the app runs now that Cloud Run and Cloud SQL are
gone: the machine that was bought, how it gets a public HTTPS address without a
public IP, what in the codebase still assumes Cloud Run, and the order in which
to build it. Local development is unaffected and stays as described in
[setup-local.md](setup-local.md).

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
| **RAM** | 16 GB DDR4 SO-DIMM, **2 slots, official maximum 32 GB** |
| **Storage** | 512 GB SSD |
| **Storage expansion** | 2× M.2 PCIe x4 (2280/2230) + 1× DM SATA connector for a 2.5" drive |
| **WLAN slot** | 1× M.2 PCIe x1 2230 — occupied by the bundled WiFi card |
| **Network** | 1× RJ-45 Gigabit Ethernet |
| **Video** | 2× DisplayPort 1.2 + one configurable port; a DP→HDMI adapter was included |
| **USB** | 3× USB 3.1 Gen 1, 3× USB 3.1 Gen 2, 1× USB 3.1 Gen 2 Type-C (front) |
| **Other** | Optional RS-232 serial (rear), headphone jack, front combo audio |
| **Chassis** | 1 L Desktop Mini |
| **Shipped with** | 原廠變壓器, 滑鼠, DP→HDMI 轉接頭, internal WiFi card, Windows 10 Pro |

The Windows licence is irrelevant — this box runs Linux. The proprietary
barrel-plug 變壓器 being included is the accessory that actually mattered;
these are awkward to replace.

### Check these on arrival

| Check | How | Why it matters |
| --- | --- | --- |
| Is the 16 GB **1×16 GB or 2×8 GB**? | `sudo dmidecode -t memory`, or open the case | One stick leaves the second SO-DIMM slot free, so 32 GB later costs one module instead of two. Two sticks means any upgrade is a full replacement. Worth knowing before RAM prices move. |
| SSD health and hours | `sudo smartctl -a /dev/nvme0n1` | It is a used drive of unknown age. Power-on hours and any reallocated sectors decide whether it is trusted with the only copy of anything. |
| Actual idle power | A plug-in power meter | Expect roughly 8-12 W. This is an estimate from the platform, not a measurement — worth checking once, since it runs 24/7. |
| PSU is the genuine HP unit | Look at the label | Listed as 原廠; third-party bricks on these are a known source of instability. |

### BIOS settings before installing anything

Press **F10** at boot.

1. **SATA mode → AHCI** (from RAID / Intel RST). Without this the Linux
   installer will not see the drive. This is the single most common stumbling
   block on these machines.
2. **After Power Loss → Power On.** The default is to stay off. For an
   always-on server this is the difference between a brief power cut and a trip
   home to press a button.
3. **Wake on LAN** — leave enabled if remote power-on is ever wanted; harmless.
4. **Secure Boot** — Ubuntu supports it, so it can stay on. Turn it off only if
   an out-of-tree driver later needs it.
5. Set a BIOS password if the box will be physically reachable by others.

## Storage

### How much is actually needed

Measured on the company machine, 2026-09-08:

| Component | Size | Detail |
| --- | --- | --- |
| Cover images (`static/covers/`) | **235 MB** | 1,883 files, gitignored, local-only |
| Postgres (`anime_site_db`) | **23 MB** | whole database including indexes, ~11,000 rows |
| Application code (`app/`, `alembic/`, `tests/`, `docs/`) | **22 MB** | what actually ships |
| Built frontend (`frontend_dist/`) | 1.9 MB | regenerated by `npm run build` |
| **Total to host** | **≈ 280 MB** | |

The 640 MB the working tree occupies on a dev machine is mostly `venv/`
(187 MB), `frontend/node_modules/` (184 MB) and `.git/` (12 MB), none of which
travel to a container.

**The 512 GB SSD holds this roughly 1,800 times over.** At ten times the
current collection — 20,000 entries — covers would reach about 2.5 GB and the
database about 250 MB. Storage capacity will not be a constraint on this
machine, and the two free M.2 slots plus the DM SATA connector mean it could
not become one without plenty of warning.

This is also why the box was chosen for RAM rather than capacity: memory
decides how many apps share it, and at 2026 prices it is the one spec that is
ruinous to add later.

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

### What does need planning: backups, not capacity

280 MB is small enough that a complete off-box backup is trivial — a nightly
`pg_dump` plus an rsync of `static/covers/` is a couple of hundred megabytes,
which fits inside Cloudflare R2's free tier with room to spare. Since covers
will exist on exactly one disk in this box, this is the part of the storage
story that actually carries risk. **A second copy is not optional.**

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

## Intended runtime shape

Nothing here exists in the repo yet — this is the sketch to build from.

| Piece | Intent |
| --- | --- |
| OS | Ubuntu Server LTS (or Debian stable), with Docker + Compose on top |
| App container | The existing `dockerfile`, unchanged. `entrypoint.sh` already runs `alembic upgrade head` and then `uvicorn ... --port ${PORT:-8080} --proxy-headers --forwarded-allow-ips='*'`, which is exactly right behind a tunnel. |
| Database | A `postgres` container with a named volume on the SSD, replacing Cloud SQL. Note that the existing `docker-compose.yml` pins `postgres:15` while a native local dev install would be 17 (which machine uses which is in `switching-environments.md`) — pick one deliberately before creating data that has to be migrated. |
| Ingress | A `cloudflared` container in the same Compose project, pointing at the app container's port |
| Covers | A bind mount for `static/covers/` (235 MB). With `GCP_BUCKET_NAME` unset the backend already writes and serves from there; only the frontend's `getCoverUrl` needs fixing — see below. |
| Backup | A nightly `pg_dump` plus an off-box copy of `static/covers/`. The existing Google Sheets backup is unaffected by all of this and keeps working. |

Connection string note: with the database in a sibling container, set
`DATABASE_URL=postgresql://<user>:<pass>@db:5432/<db>`. `app/config.py` ignores
a `DATABASE_URL` containing `localhost` (a deliberate guard against a leaked
local `.env`), so the host must be the container name, not `localhost`.

## Build order

Nothing below is done yet. Roughly dependency-ordered; the code changes can
proceed in parallel with the hardware bring-up.

1. **Bring up the box** — the BIOS settings above, install Ubuntu Server LTS,
   `apt install docker.io docker-compose-plugin`, create a non-root user, set
   up SSH keys, DHCP reservation on the router.
2. **Verify the hardware** — the four arrival checks above. Do this before any
   data lives on it.
3. **Fix the production signal** — the `is_cloud_run` problem below. This gates
   exposing the box publicly, so it comes before the tunnel.
4. **Fix `getCoverUrl`** — one function plus one env var, below. Without it
   every cover is blank behind the tunnel.
5. **Write the production `docker-compose.yml`** — app + postgres + cloudflared,
   named volume for the database, bind mount for `static/covers/`.
6. **Load the data** — restore the database, copy `static/covers/` across.
   Decide Postgres 15 vs 17 *before* this step.
7. **Domain and tunnel** — register `cg1618.com` at Cloudflare Registrar (the
   zone comes with Cloudflare nameservers already set), create the tunnel, then
   `cloudflared tunnel route dns` for the chosen hostname.
8. **Backups** — nightly `pg_dump` + covers sync to R2, and verify a restore
   actually works before relying on it.
9. **Decide CI** — whether `.github/workflows/deploy.yml` gains a self-hosted
   path or the deploy job is retired, leaving CI as tests only.

## What has to change in the code

The app currently treats "production" and "Cloud Run" as the same thing. Each
of these branches keys off `settings.is_cloud_run`, which is true only when
Cloud Run sets `K_SERVICE`. On this box that variable is absent, so every one
of them silently takes its *development* path even though the app is publicly
reachable. **These are the blockers to fix before exposing the box to the
Internet:**

| Location | Behaviour off Cloud Run | Why it matters here |
| --- | --- | --- |
| `app/routers/auth.py:73` | The login cookie is set with `secure=is_cloud_run`, i.e. **not** `Secure` | The tunnel serves real HTTPS, so the flag should be on. Browsers accept the cookie either way, so this fails quietly. |
| `app/config.py:112` (`validate_production`) | Returns immediately; **no fail-fast** | The startup check that refuses a default `JWT_SECRET_KEY` or `ADMIN_PASSWORD` would not run. A public deployment could come up on `admin123` with nothing complaining. This is the most dangerous one. |
| `frontend/src/lib/covers.js:16` (`getCoverUrl`) | Switches on **hostname**; anything that is not `localhost` gets a hard-coded `storage.googleapis.com` URL | Behind the tunnel the hostname is real, so every cover points at the dead bucket while the files sit on disk. See below. |
| `app/config.py:75` (`bucket_name`) | `None` unless `GCP_BUCKET_NAME` is set | **Not a blocker — this is the wanted behaviour.** A `None` bucket is what makes `image_manager.py` use local disk. Leave it unset. |
| `app/utils/gcp_utils.py:33` | Falls through to `GOOGLE_CREDENTIALS_JSON` or default discovery instead of native IAM | Never reached once the bucket is unset, so harmless here. Still the code that would need replacing if R2 is ever chosen over local disk. |

The likely shape of the fix is a general "this is a production runtime" signal
in `app/config.py` — an explicit env var that `is_cloud_run` is only one way of
satisfying — rather than sprinkling more environment checks through the code.
**Not designed yet; decide before implementing.**

### Cover images: smaller than it looks, but the frontend blocks it

**The backend storage seam already exists and already works; the blocker is one
function in the frontend.**

**The backend is already dual-mode.** Every function in
`app/services/integrations/image_manager.py` branches on
`get_active_bucket_name()`: with a bucket configured it talks to GCS, and
without one it falls through to `static/covers/<owner_type>/<system_id>.jpg` on
local disk. That applies to `download_cover_image`, `cover_image_exists`,
`list_all_cover_images` and `delete_cover_image` alike — write, read, list and
delete all have a working local path. `app/main.py:148` already mounts
`/static`, so the files are served. This is the mode running locally today, and
the 235 MB in `static/covers/` is the proof.

**The frontend is not.** `frontend/src/lib/covers.js:16-21`:

```js
export function getCoverUrl(coverFile) {
  if (!coverFile || coverFile === "N/A") return FALLBACK_SVG;
  return isLocalHost()
    ? `/static/covers/${coverFile}`
    : `https://storage.googleapis.com/${BUCKET_NAME}/${coverFile}`;
}
```

The switch is on **hostname**, not on configuration, and `isLocalHost()` only
recognises `localhost` and `127.0.0.1`. On this box reached through the tunnel
at a real hostname, that check is false, so every cover URL points at the dead
bucket — blank images across the whole site, while the files sit readable on
disk one directory away. `BUCKET_NAME` is also hard-coded here
(`cg1618-anime-covers`), independently of `GCP_BUCKET_NAME` on the backend.

**The fix is small**: replace the hostname test with a build-time base URL
(`import.meta.env.VITE_COVER_BASE_URL` or similar), defaulting to
`/static/covers/`. That is one function and one env var, not a storage
abstraction.

`getQuoteImageUrl` just below it has the same hostname gate and deliberately
returns `null` off localhost, because Cloud Run's filesystem was ephemeral and
uploads would vanish on restart. **That rationale disappears on this box, which
has a persistent disk** — quote images could simply work. Worth revisiting in
the same change.

#### Local disk, with R2 as the backup target

1. **Local disk (chosen)** — already implemented on the backend, needs only the
   frontend change. Zero third parties, and covers load from the same origin as
   the app. The cost is that the images live on one disk and must be part of
   the backup story.
2. **Cloudflare R2** — S3-compatible, free at this volume, already inside the
   Cloudflare account the tunnel needs. Rejected as the *primary* store because
   `gcp_utils` speaks the GCS client library, so it would need a real storage
   seam plus credentials and a bucket to manage — work that local disk does not
   require.

At 235 MB, a nightly sync to R2 costs nothing and keeps the copy that matters,
which also answers the backup question above.

## Open questions

- How "production" is signalled once it is no longer synonymous with Cloud Run.
- Postgres 15 vs 17 for the container, and how the existing data is loaded in.
- Whether `.github/workflows/deploy.yml` gains a self-hosted path or the deploy
  job is simply retired, leaving CI as tests only.
- What the apex `cg1618.com` serves — a landing page linking the projects, or
  a redirect to one of them.
- Whether `journal`, `health` and `money` get Cloudflare Access in front of
  them or no public hostname at all (see [Planned hostnames](#planned-hostnames)).
- Whether `getQuoteImageUrl` is fixed alongside `getCoverUrl` so quote images
  work on a box with a persistent disk.

## See also

- [deployment-gcp.md](deployment-gcp.md) — the deployment this replaces, and
  the reference for the container image and CI that carry over unchanged.
- [setup-local.md](setup-local.md) — local development, unaffected.
- [external-apis.md](external-apis.md) — GCS, Sheets and the metadata APIs.
