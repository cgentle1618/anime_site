# Deployment (self-hosted mini PC + Cloudflare Tunnel)

Last verified: 2026-09-08 (commit 7f17289)

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
| Where does it run? | A dedicated small x86 PC at home, on all the time | The app is small — FastAPI + one Postgres + a static bundle, idle RAM well under 1 GB. A laptop works but is not meant to be a server. |
| Which box? | **A used business micro/SFF PC (8th-gen Intel i5 or better), 16 GB RAM, ~256-512 GB SSD** — see [Hardware](#hardware) | x86, so every Docker image works unmodified (no arm64 surprises). Bought used, the RAM and SSD come bundled at pre-2026 prices, which is now the whole argument. |
| How is it reached? | **Cloudflare Tunnel** (`cloudflared`) | Outbound-only connection, so no port forwarding, no static IP, and it works even behind CGNAT. Free HTTPS, and the home IP is never exposed. |
| What is *not* being used? | Raspberry Pi, NAS, VPS, **new N100/N150 mini PC** | See [Alternatives considered](#alternatives-considered). |

## Hardware

### The market condition that drives this choice

**Revised 2026-09-08.** This file previously called for a *new* N100/N150 mini
PC at NT$4,500-7,000. That price no longer exists. DRAM and NAND are in a
historic spike: DDR5 is up roughly 400-500% year-over-year, DDR4 150-200%, and
NAND has roughly doubled, as AI demand pulled fab capacity to HBM. The retail
consequence is visible in the listings — a new N150 box with 16 GB / 256 GB now
sits at **NT$12,990-19,825**, about double its normal price and *more* than a
used 6-core i5 with the same memory.

So the rule for this purchase, until the memory cycle turns:

> **Buy a used machine with the RAM and SSD already in it. Never buy 準系統
> (barebones) and populate it.**

A barebones OptiPlex 7080 SFF at NT$7,500 plus 16 GB and a 512 GB SSD costs
more than any complete machine in the table below.

### Target spec

**A used corporate off-lease micro or SFF desktop**, Dell OptiPlex Micro /
HP EliteDesk-ProDesk mini / Lenovo ThinkCentre Tiny class:

- **CPU** — Intel 8th-gen i5 (i5-8400 / 8500 / 8500T / 8600T) or newer. Six
  cores, and comfortably faster than the N150 that was the original plan.
- **RAM** — 16 GB preferred, 8 GB acceptable. 16 GB is more than this app
  needs; it is there so Postgres has room and so the box can absorb whatever
  else gets put on it later. Note that "upgrade the RAM later" is *not* the
  cheap escape it normally is, so pay for it up front if the budget allows.
- **Storage** — 256 GB SSD minimum; whatever is in the machine is fine.
- **Budget** — **NT$4,300-7,500** for the machine.

### Storage for covers

Whichever box is chosen, cover images need somewhere to live if [local
disk](#cover-images-the-one-genuinely-open-problem) wins over R2.

- Micro/mini machines (1 L) take **M.2 + one 2.5" bay only** — no 3.5" drive.
  Pair with an external USB disk.
- SFF towers have an internal **3.5" bay**, which is tidier if a large disk is
  wanted.

Counter-intuitively, external USB disks are currently *cheaper per TB* than
internal ones here: **Seagate One Touch 2TB at NT$3,799** (Yahoo購物中心;
PChome / momo / 蝦皮 all NT$4,188) against **NT$5,990** for an internal 2 TB
WD Purple or **NT$7,690** for a 4 TB WD Red Plus. 2 TB is vastly more than the
cover art will ever need.

### Linux notes

All of these are mainstream Intel business hardware and run Debian or Ubuntu
LTS without drama. Two practical points:

1. On the Dell and Lenovo machines, **switch SATA mode from RAID / Intel RST to
   AHCI in the BIOS before installing**, or the installer will not see the NVMe
   drive. This is the single most common stumbling block with these boxes.
2. The Windows licence most of them are sold with is irrelevant here and should
   not be paid a premium for.

### Running cost

A used micro PC idles around 8-15 W (an SFF tower more like 20-30 W), so
roughly **6-11 kWh/month**, or **NT$25-50/month** in electricity. Add a domain
at ~NT$400/year. Cloudflare Tunnel itself is free at this scale.

Against a one-off ~NT$5,000-10,000 for hardware plus disk, the whole thing
still pays for itself versus a paid cloud runtime within months, which is the
point of the exercise.

## Candidate listings

Surveyed **2026-09-08**. Used stock turns over in days and these were read from
price-comparison indexes, so **confirm stock and the exact configuration with
the seller before paying** — several explicitly ask for a message first
(先詢問庫存). Prices are what was listed on the survey date.

### Ranked, best first

Ranked on fitness for *this* job, not on price, so the order jumps across price
brackets. The weighting, in order:

1. **RAM** — the one spec that decides how many apps fit on the box, and the
   one that is ruinous to add later at 2026 prices.
2. **Cores and generation** — 6 cores beats 4; newer beats older.
3. **Price** — as a tiebreaker between comparable machines.
4. **Seller** — a dealer with physical stores beats an anonymous listing.

**Storage capacity is deliberately not weighted.** The whole deployment is
about 280 MB (235 MB of covers, 23 MB of database, 22 MB of code), so a 256 GB
SSD already holds it roughly 900 times over and a 512 GB one buys nothing.

| # | Machine | Price | Where |
| --- | --- | --- | --- |
| **1** | **Intel NUC8i5BEH** — i5-8259U (4C/8T), **32 GB**, 256 GB SSD | NT$6,500 | [Yahoo拍賣 — US3C 新北板橋店](https://tw.bid.yahoo.com/item/101760451743) |
| **2** | **HP ProDesk 600 G4 mini** — i5-8500T (6C), 8 GB, 256 GB SSD | NT$4,280 | [Shopee — Better 3C 二手倉庫 (高雄)](https://shopee.tw/product/7123416/22021629456) |
| **3** | Dell OptiPlex 7060 Micro — i5-8600T (6C), 16 GB, 256 GB | NT$6,999 | [Shopee — 中古電腦零件專賣 (基隆七堵)](https://biggo.com.tw/s/OptiPlex%207060%20micro) |
| **4** | Lenovo 商用 — i5-8500 (6C), 16 GB, 512 GB SSD | NT$7,200 | [Yahoo拍賣 — 專業電腦量販維修](https://tw.bid.yahoo.com/item/101708382491) |
| **5** | Lenovo M80S (SFF) — i5-10500 (6C/12T), 16 GB, 512 GB | NT$8,400 | [樺仔二手電腦](https://used-computer.tw/) (homepage feature; not in the [desktop category listing](https://used-computer.tw/Desktop-pc), so confirm stock) |
| **6** | Lenovo 商用 — i5-9500 (6C), 16 GB, 512 GB | NT$7,500 | Yahoo拍賣, same seller as #4 |
| **7** | Acer 商用 — i5-8400 (6C), 16 GB, 512 GB | NT$7,400 | Shopee |
| **8** | Lenovo 商用主機 — i5-8400 (6C), 8 GB, 256 GB M.2 | NT$4,800 | [Yahoo拍賣 — 專業電腦量販維修](https://tw.bid.yahoo.com/item/101708382491) |
| **9** | Lenovo 商用小主機 — i5-8500 (6C), 8 GB, 256 GB M.2, 內建 WiFi | NT$5,500 | [Shopee — 桃園](https://shopee.tw/product/204914004/27729474942) |
| **10** | HP 商用 — i5-9500 (6C), 16 GB, 512 GB | NT$7,900 | Shopee |
| **11** | HP 商用 — i5-10400 (6C/12T), 16 GB, 512 GB | NT$9,400 | Shopee |
| **12** | HP EliteDesk 800 G3 迷你 — i5 7代, 8 GB, SSD | NT$6,500 | [Yahoo拍賣 — 樺仔南港店](https://tw.bid.yahoo.com/item/101740812164) |

### Why the order lands where it does

**#1 NUC8i5BEH** wins on the only scarce resource. 32 GB of DDR4 alone retails
for roughly NT$7,000-9,000 right now — the machine costs less than its own
memory. Four cores instead of six is the trade, and it is the right one when
the box is meant to hold several apps. US3C is a chain with physical stores.

**#2 ProDesk 600 G4 mini** is the value outlier: six cores, 1 L, ~8 W idle, and
NT$2,220 less than #1. Ranked second only because 8 GB is the ceiling that
matters, and topping it up later is exactly what this market makes expensive.
That seller's listing spans NT$3,500-8,080 across configurations, so a 16 GB
variant may be reachable — worth asking, and would move it to #1.

**#3 over #4** because storage no longer counts. The OptiPlex is NT$201 cheaper
with equivalent CPU and the same 16 GB; its 256 GB versus the Lenovo's 512 GB
is a difference this deployment cannot use.

**#5-#7** are all sound 16 GB six-core machines; the M80S ranks highest of them
for the newest CPU and a dealer with three physical stores, and is the pick if
an SFF tower with an internal 3.5" bay is wanted anyway.

**#8-#9** are fine machines held back by 8 GB, and both cost more than #2 while
offering no more memory.

**#10-#11** are duplicates of better-priced entries above them — #10 is #6 for
NT$400 more, #11 is the same idea at the top of the budget.

**#12 is last on merit**: 7th-generation CPU *and* 8 GB *and* NT$6,500. #2
beats it on every axis for NT$2,220 less. Listed only because the seller is
reputable and it may be the last one standing.

### Do not buy

| Listing | Why |
| --- | --- |
| [露天 — OptiPlex 7080 SFF, i5-10500, NT$7,500](https://www.ruten.com.tw/item/22606131063561/) | **準系統** — no RAM, no SSD. Populating it costs more than any complete machine above. |
| 露天 ThinkCentre M720q at NT$22,000-32,000 | China-based dropshippers listing a ~NT$5,000 machine. 露天 is heavily polluted with these; filter to 台灣出貨 sellers with real feedback. |
| New N150 mini PC at NT$12,990+ | Double the price for less CPU than a used i5. Revisit in a future memory cycle. |

### Where to search when these are gone

| Source | For |
| --- | --- |
| [蝦皮](https://shopee.tw/search?keyword=%E4%BA%8C%E6%89%8B%20%E5%95%86%E7%94%A8%E9%9B%BB%E8%85%A6%20i5) | The largest used-business-PC market here. Not indexable by automated search — browse it directly. |
| [Yahoo拍賣 — 二手電腦主機](https://tw.bid.yahoo.com/search/auction/product?cid=23344&clv=2&p=%E4%BA%8C%E6%89%8B%E9%9B%BB%E8%85%A6%E4%B8%BB%E6%A9%9F) | Where the established dealers (樺仔, US3C, 光華維修中心) list |
| [BigGo](https://biggo.com.tw/) | Indexes Shopee, Yahoo and 露天 together; the practical way to price-compare across all three |
| [樺仔二手電腦](https://used-computer.tw/) | Corporate off-lease Dell/HP/Lenovo, three physical stores |
| [US3C](https://www.us3c.com.tw/) | Chain with stores in 台北, 桃園, 台中, 台南, 高雄 |
| [鎧信電腦 (新竹)](https://www.kai-sin.com.tw/) | States a one-month warranty on used |
| [露天拍賣](https://www.ruten.com.tw/find/?q=OptiPlex+7060+SFF), 光華商場 | Usable, but see the dropshipper warning above |
| [Carousell 旋轉拍賣](https://tw.carousell.com/categories/computers-tech-1094/) | Often cheapest, zero warranty |

Two filters worth applying to every search: **reject 準系統 / 裸機 / 不含記憶體
硬碟**, and **check the seller ships from Taiwan**.

### Alternatives considered

| Option | Why not |
| --- | --- |
| **New N100/N150 mini PC** (Beelink S12 Pro, GMKtec G3, MOREFINE M9/M11) | The original plan, overturned by the memory spike. NT$12,990-19,825 for 16 GB / 256 GB, which is double normal and slower than a used i5 at a third of the price. Reconsider when DRAM normalises. |
| Raspberry Pi 5 (8 GB) | Works — arm64 Postgres images are fine — but at NT$1,600-10,675 for the board alone, plus NVMe HAT, PSU and case, it is not cheaper than a used x86 box, is slower, and has no SATA. Its only real win is a few watts. |
| Beelink ME mini (6-slot M.2 NAS box) | Neat design, ~US$329 plus import. Rejected because M.2-only storage means buying capacity at spike prices, which is exactly what this plan avoids. |
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
| Database | A `postgres` container with a named volume on the NVMe, replacing Cloud SQL. Note that the existing `docker-compose.yml` pins `postgres:15` while a native local dev install would be 17 (which machine uses which is in `switching-environments.md`) — pick one deliberately before creating data that has to be migrated. |
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
