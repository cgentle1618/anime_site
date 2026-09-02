# Deployment (self-hosted mini PC + Cloudflare Tunnel)

Last verified: 2026-09-02 (commit 5ae9520)

> ## Status: plan, not a deployment
>
> **Nothing in this file is built yet.** No hardware has been bought, no
> production `docker-compose` file exists, and none of the code changes listed
> under [What has to change in the code](#what-has-to-change-in-the-code) have
> been made. This is the agreed direction after the GCP deployment went down on
> 2026-09-02 (see [deployment-gcp.md](deployment-gcp.md)), written down so the
> decision and its open questions survive between sessions.
>
> Read every "will" below as "is intended to". The one thing that *is* settled
> is the shape: **a small always-on x86 mini PC at home, reached from the
> Internet through a Cloudflare Tunnel.**

**What this is for.** Where the app is meant to run now that Cloud Run and
Cloud SQL are gone: which box to buy in Taiwan, how it gets a public HTTPS
address without a public IP, and what in the codebase currently assumes Cloud
Run and would have to change first. Local development is unaffected and stays
as described in [setup-local.md](setup-local.md).

## The decision

| Question | Answer | Why |
| --- | --- | --- |
| Where does it run? | A dedicated mini PC at home, on all the time | The app is small — FastAPI + one Postgres + a static bundle, idle RAM well under 1 GB. A laptop works but is not meant to be a server. |
| Which box? | **Intel N100/N150 mini PC, 16 GB RAM, ~500 GB NVMe** | x86, so every Docker image works unmodified (no arm64 surprises). ~7-12 W idle, silent, palm-sized. |
| How is it reached? | **Cloudflare Tunnel** (`cloudflared`) | Outbound-only connection, so no port forwarding, no static IP, and it works even behind CGNAT. Free HTTPS, and the home IP is never exposed. |
| What is *not* being used? | Raspberry Pi, NAS, VPS | See [Alternatives considered](#alternatives-considered). |

## Hardware

### Chosen

An Intel **N100 or N150** mini PC — Beelink S12 Pro, GMKtec G3, MINISFORUM and
ASUS NUC-class boxes are all the same idea. Target spec: **16 GB RAM,
500 GB NVMe**, roughly **NT$4,500-7,000** new.

16 GB is more than this app needs; it is there so Postgres has room and so the
box can absorb whatever else gets put on it later without a second purchase.

### Where to buy in Taiwan

| Source | For |
| --- | --- |
| PChome 24h, momo, 蝦皮 | New N100/N150 mini PCs from local sellers, with a warranty |
| 光華商場, 露天拍賣 | Used Lenovo ThinkCentre / Dell OptiPlex tiny PCs, if the cheap route is taken instead |
| 台灣樹莓派 (raspberrypi.com.tw), 機器人王國 | Raspberry Pi gear, if that option is ever revisited |

### Running cost

A ~10 W box drawing power continuously is about **7 kWh/month**, roughly
**NT$25-35/month** in electricity. Add a domain at ~NT$400/year. Cloudflare
Tunnel itself is free at this scale.

Against a one-off ~NT$6,000 for the hardware, the whole thing pays for itself
versus a paid cloud runtime within months, which is the point of the exercise.

### Alternatives considered

| Option | Why not |
| --- | --- |
| Raspberry Pi 5 (8 GB) | Works — arm64 Postgres images are fine — but once an NVMe HAT, PSU and case are added it costs about the same as an N100 and is slower. Its only real win is a few watts. |
| Used SFF office PC (ThinkCentre M720q, OptiPlex Micro) | Cheapest RAM per NT$, and widely available second-hand here. Rejected for a new purchase: older, louder, 15-25 W, no warranty. Still the fallback if the budget tightens. |
| Synology / QNAP NAS | NT$12,000+, and Docker plus Postgres on one is more awkward than on a plain Linux box. Only worth it if a NAS is wanted for its own sake. |
| VPS (Hetzner / Vultr / Linode / 本地主機商) | ~US$5-7/month, no hardware and no uptime worries. Rejected because the goal is to stop paying a recurring bill, but it remains the honest comparison and the obvious escape hatch if home hosting turns out to be a chore. |

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

Requires a domain (~NT$400/year) with its nameservers pointed at Cloudflare.

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
| OS | A plain Linux server distribution (Debian or Ubuntu LTS), with Docker + Compose on top |
| App container | The existing `dockerfile`, unchanged. `entrypoint.sh` already runs `alembic upgrade head` and then `uvicorn ... --port ${PORT:-8080} --proxy-headers --forwarded-allow-ips='*'`, which is exactly right behind a tunnel. |
| Database | A `postgres` container with a named volume on the NVMe, replacing Cloud SQL. Note that the existing `docker-compose.yml` pins `postgres:15` while native local dev is 17 — pick one deliberately before creating data that has to be migrated. |
| Ingress | A `cloudflared` container in the same Compose project, pointing at the app container's port |
| Covers | Currently GCS. Needs a replacement — see below. |
| Backup | A nightly `pg_dump` to the NVMe plus an off-box copy. The existing Google Sheets backup is unaffected by all of this and keeps working. |

Connection string note: with the database in a sibling container, set
`DATABASE_URL=postgresql://<user>:<pass>@db:5432/<db>`. `app/config.py` ignores
a `DATABASE_URL` containing `localhost` (a deliberate guard against a leaked
local `.env`), so the host must be the container name, not `localhost`.

## What has to change in the code

The app currently treats "production" and "Cloud Run" as the same thing. Each
of these branches keys off `settings.is_cloud_run`, which is true only when
Cloud Run sets `K_SERVICE`. On a self-hosted box that variable is absent, so
every one of them silently takes its *development* path even though the app is
publicly reachable. **These are the blockers to fix before exposing the box to
the Internet:**

| Location | Behaviour off Cloud Run | Why it matters here |
| --- | --- | --- |
| `app/routers/auth.py:73` | The login cookie is set with `secure=is_cloud_run`, i.e. **not** `Secure` | The tunnel serves real HTTPS, so the flag should be on. Browsers accept the cookie either way, so this fails quietly. |
| `app/config.py:112` (`validate_production`) | Returns immediately; **no fail-fast** | The startup check that refuses a default `JWT_SECRET_KEY` or `ADMIN_PASSWORD` would not run. A public deployment could come up on `admin123` with nothing complaining. This is the most dangerous one. |
| `app/config.py:75` (`bucket_name`) | `None` unless `GCP_BUCKET_NAME` is set | Cover storage has no destination — see below. |
| `app/utils/gcp_utils.py:33` | Falls through to `GOOGLE_CREDENTIALS_JSON` or default discovery instead of native IAM | Fine as-is *if* a service account is supplied; it is the GCS dependency itself that is the problem. |

The likely shape of the fix is a general "this is a production runtime" signal
in `app/config.py` — an explicit env var that `is_cloud_run` is only one way of
satisfying — rather than sprinkling more environment checks through the code.
**Not designed yet; decide before implementing.**

### Cover images: the one genuinely open problem

Covers live in a GCS bucket, and that bucket is part of the deployment that is
down. Self-hosting needs a replacement. Two candidates, neither chosen:

1. **Local disk** — a bind-mounted directory on the NVMe, served by the app.
   Simplest, no third party, but the images then live on one box only and have
   to become part of the backup story.
2. **Cloudflare R2** — object storage, S3-compatible, generous free tier, and
   already inside the Cloudflare account the tunnel needs anyway. Keeps the
   current "images are remote objects" shape and survives the box dying.

Either way, `image_manager.py` and `gcp_utils.py` need a storage-backend seam
rather than a hard GCS dependency. This is the largest piece of work in the
migration and should be scoped on its own.

## Open questions

- Storage backend for covers: local disk or R2 (above).
- How "production" is signalled once it is no longer synonymous with Cloud Run.
- Postgres 15 vs 17 for the container, and how the existing data is loaded in.
- Whether `.github/workflows/deploy.yml` gains a self-hosted path or the deploy
  job is simply retired, leaving CI as tests only.
- Whether the public hostname is the existing domain or a new one.

## See also

- [deployment-gcp.md](deployment-gcp.md) — the deployment this replaces, and
  the reference for the container image and CI that carry over unchanged.
- [setup-local.md](setup-local.md) — local development, unaffected.
- [external-apis.md](external-apis.md) — GCS, Sheets and the metadata APIs.
