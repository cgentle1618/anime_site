# Deployment (self-hosted HP ProDesk 600 G4 mini + Cloudflare Tunnel)

Last verified: 2026-09-13 (machine inspected in the bundled Windows — parts, drive wear, SATA mode and disk contents confirmed and recorded; still nothing installed)

> ## Status: hardware bought and inspected, nothing deployed yet
>
> **The machine is purchased and inspected** — an HP ProDesk 600 G4 Desktop
> Mini, bought 2026-09-08 for NT$5,680 (see [The machine](#the-machine)). It
> matches what was advertised, the drive is healthy and every port works, so
> it is being kept. Everything else in
> this file is still ahead: no OS is installed, no production
> `docker-compose.yml` exists, and none of the code changes under
> [What has to change in the code](#what-has-to-change-in-the-code) have been
> made. The OS install is now documented step by step under
> [Bringing up the box](#bringing-up-the-box) — documented, not
> done.
>
> The code side has moved too. On **2026-09-08 the GCP code was removed**,
> which finished the cover-image work listed under
> [What has to change in the code](#what-has-to-change-in-the-code) and left
> the rest of it in a different shape: there is no longer a production mode
> taking the wrong path, because there is no production mode at all. Building
> one is now the blocker.
>
> This is the replacement for the GCP deployment that went down on 2026-09-02
> (see [deployment-gcp.md](deployment-gcp.md)). The shape is settled: **an
> always-on 1 L x86 mini PC at home, reached from the Internet through a
> Cloudflare Tunnel.** Hardware alternatives are closed — do not reopen them.

**What this is for.** Where the app runs now that Cloud Run and Cloud SQL are
gone: the machine that was bought, how it gets a public HTTPS address without a
public IP, what the code still needs before it can be exposed, and the order in
which to build it. Local development is unaffected and stays as described in
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
| **RAM** | 16 GB DDR4 SO-DIMM as **2 × 8 GB, both slots occupied** — Kingston `9905700-012.A00G`, DDR4-2667 running at its rated 2667, dual channel (DIMM1 on channel B, DIMM3 on channel A). Official maximum is 32 GB, so that upgrade **replaces both sticks** rather than adding one. |
| **Storage** | 512 GB **SATA** SSD — Transcend `TS512GSSD370S`, 477 GB usable, on the DM SATA connector. **Not NVMe**, so it appears as `/dev/sda` under Linux and tops out around 550 MB/s. |
| **Storage expansion** | 2× M.2 PCIe x4 (2280/2230). The boot SSD is on the DM SATA connector, so both should be empty — not confirmed, since the case has not been opened |
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
`smartctl` form are taken in [step 9](#step-9--finish-the-hardware-checks).

### Firmware and disk state as delivered

- **SATA mode is already AHCI** (`Intel(R) 300 Series Chipset Family SATA AHCI
  Controller`), not RAID / Intel RST, so the change in
  [step 3](#step-3--bios-settings) is a confirmation rather than an edit.
- **Virtualisation (VT-x) is enabled** in firmware.
- The disk carries an EFI system partition (0.3 GB), `C:` (250 GB) and `D:`
  (226.6 GB), and **nothing else — no HP recovery partition**. `D:` holds only
  an empty recycle bin, so the whole disk can be given to the installer with
  nothing to preserve.

**What to do with it** is [Bringing up the box](#bringing-up-the-box)
below — the inspection comes first, in the Windows it ships with, and the
Windows licence stops mattering after that.

## Bringing up the box

**Nothing here has been done yet.** Everything from unboxing to a machine that
answers SSH and runs Docker, written for someone who has never installed Linux:
every screen, every answer, and what to do when an answer is wrong. Budget about
an hour, most of which is the download.

### The five phases

The work moves between two machines, and most confusion about this procedure is
really confusion about which one you are sitting at. Do them in order — each
phase is a heading below, with its steps under it.

| Phase | Where you are | Steps | What happens |
| --- | --- | --- | --- |
| **[A. Prepare the stick](#phase-a--prepare-the-usb-stick)** | At the dev machine | 1-2 | Download the ISO, write the USB. Touches nothing on the box, so do it while waiting for it to arrive. |
| **[B. Inspect](#phase-b--inspect-the-machine-in-the-bundled-windows)** | At the box, in **the bundled Windows** | — | Every check that needs Windows, run before anything is changed. Ends with a keep-or-return decision. **Mostly done — the machine passed**; three checks remain, and none of them blocks phase C. |
| **[C. Set the BIOS](#phase-c--set-the-bios)** | At the box, monitor and keyboard | 3 | Five firmware settings. **After phase B, never before** — see below. |
| **[D. Install Ubuntu](#phase-d--install-ubuntu)** | At the box, monitor and keyboard | 4-5 | Boot the installer and answer its screens. **SSH is switched on here**, inside the installer. |
| **[E. Finish over SSH](#phase-e--finish-the-setup-over-ssh)** | At the dev machine, over SSH | 6-11 | Docker, housekeeping, the remaining hardware readings, the router. The monitor comes off at the start of this phase and does not go back on. |

The two sections before phase A are reading, not doing: which Ubuntu, and what to
have on the desk. **If the box cannot reach the router with a cable**, the
options are in phase D, at
[If no cable can reach the box](#if-no-cable-can-reach-the-box) — the installer's
network screen is where that is actually decided, and
[phase B](#phase-b--inspect-the-machine-in-the-bundled-windows) is where you learn which of them will work.

Two things that are easy to get wrong, both of which cost real time:

- **SSH is not a later step.** "Install OpenSSH server" and the GitHub key import
  are a checkbox on one of the installer's own screens (step 5). By first boot,
  SSH is already running with your key already installed. Step 6 does not set it
  up; it is the moment you first *use* it and put the monitor away.
- **Phase B has to be finished before phase D.** The install erases the
  bundled Windows, and with it the easiest way to inspect a machine that can
  still be returned — the WiFi card model and the serial/BIOS pair are read
  there or not at all. (The usual extra hazard, SATA mode changing under
  Windows, does not apply: this box is already AHCI.)

### Which Ubuntu, and why Server rather than Desktop

**Ubuntu Server 26.04.1 LTS ("Resolute Raccoon")** — confirmed against
[releases.ubuntu.com](https://releases.ubuntu.com/) on 2026-09-10. LTS means five
years of security updates, to 2031.

Take the **`.1` point release**, not the original 26.04: the directory offers
both, and the point release is the same system with several months of fixes
already folded in, so the first `apt upgrade` is far shorter.

Two ways to pick the wrong file from that page, both easy:

- **A non-LTS release** such as 25.10 or 26.10. Nine months of support, then a
  forced reinstall.
- **An ESM release** — 14.04, 16.04, 18.04 and 20.04 are all still listed, lower
  down the page, under *Extended Security Maintenance*. They exist for people
  keeping old systems alive. 14.04 is from 2014 and predates this machine's CPU
  by four years; nothing that old belongs on it.

Server, not Desktop, for four reasons:

- The box is headless and always on. A desktop session costs roughly 700 MB to
  1 GB of RAM permanently, on a machine that is meant to hold several small
  apps at once.
- Fewer installed packages means fewer things to patch on a machine that will
  be reachable from the Internet through the tunnel.
- Everything that runs here — Docker, Postgres, `cloudflared` — is
  command-line. There is nothing for a GUI to show.
- Desktop enables automatic suspend and a different network stack by default;
  both would have to be undone for a server.

Debian stable is an equally sound choice and the runtime table above allows it.
**Pick Ubuntu.** It is what the rest of this file assumes, its Docker packaging
is better tested, and mixing the two in one's head is how commands stop matching
the documentation.

There is no 32-bit or ARM question here — the i5-8500T is x86-64, so the file to
download is the **`amd64`** one.

**This erases the bundled Windows 10 Pro.** That is intended. The licence is
embedded in the board's firmware, so Windows can be reinstalled later without
buying a key if the machine is ever repurposed or sold. Nothing on the used
drive is worth keeping.

### What to have ready before starting

| Thing | Notes |
| --- | --- |
| A USB stick, 8 GB or larger | **It will be erased completely.** Any old stick will do. |
| A monitor and the DP-to-HDMI adapter | The adapter came with the machine. The mini has DisplayPort; most monitors have HDMI. |
| A USB keyboard | The bundled mouse is not needed — the installer is keyboard-only. |
| An Ethernet cable to the router | The end state, and the easiest install. If the box cannot reach the router yet, a phone hotspot or USB tethering will do for setup — see [if no cable can reach the box](#if-no-cable-can-reach-the-box). A server left on WiFi permanently is a server that drops off at 3am. |
| A second computer | A dev machine, to write the USB stick and afterwards to SSH in. |
| The router's admin page | For the DHCP reservation at the end. |

### Phase A — Prepare the USB stick

*At the dev machine. Nothing here touches the box, so it can all be done before
the box arrives — and should be, so that the day it turns up the only question
left is whether the hardware is sound, not whether a 3 GB download has finished.*

#### Step 1 — Download the ISO and verify it

On the dev machine, from [releases.ubuntu.com](https://releases.ubuntu.com/),
download **`ubuntu-26.04.1-live-server-amd64.iso`** (about 3 GB) — the listing is
[releases.ubuntu.com/26.04/](https://releases.ubuntu.com/26.04/). If the download
crawls, use a Taiwan mirror; `free.nchc.org.tw/ubuntu-cd/` is the NCHC one.

**Every part of that filename matters:**

| Part | Why |
| --- | --- |
| `26.04.1` | The point release. Plain `26.04` sits in the same directory. |
| `live-server` | `desktop` is the GUI image decided against above. A name with no `live-` at all — `ubuntu-...-server-amd64.iso` — is a pre-18.04 image, which means you are on the wrong release entirely. |
| `amd64` | x86-64, which is what the i5-8500T is. |

`netboot` and `mini` images are not what this is.

Then check the download is intact. In PowerShell, in the folder holding the ISO:

```powershell
Get-FileHash .\ubuntu-26.04.1-live-server-amd64.iso -Algorithm SHA256
```

Compare the output against the matching line in the `SHA256SUMS` file next to
the ISO on the download page. They must match character for character. If they
do not, the download is corrupt — delete it and fetch it again. A corrupt ISO
produces installer errors that look like hardware faults and will cost far more
time than this check.

#### Step 2 — Write the ISO to the USB stick

Use [Rufus](https://rufus.ie/) on Windows. It is a single `.exe`, no install.

1. Insert the USB stick. **Confirm nothing on it is wanted.**
2. Open Rufus. Under **Device**, select the stick — check the size shown, so an
   external backup drive is never picked by accident.
3. **Boot selection** → `SELECT` → the downloaded ISO.
4. **Partition scheme: GPT.** **Target system: UEFI (non CSM).** These are the
   defaults once the ISO is chosen; leave them.
5. Leave volume label and file system alone. Click **START**.
6. If Rufus offers **ISO mode or DD mode**, choose **ISO mode** (recommended).
7. Wait for READY, then eject.

balenaEtcher is a fine alternative and asks fewer questions. Do not simply copy
the ISO onto the stick in Explorer — that does not produce a bootable disk.

### Phase B — Inspect the machine, in the bundled Windows

*At the box, in the Windows it shipped with. Nothing is installed or changed
yet — this phase exists to decide whether the machine is kept at all, while
returning it is still possible.*

**Do all of this from the bundled Windows 10, before installing anything.** The
machine ships with a working OS; use it once, for exactly this, then erase it.
Three reasons the order matters:

- **The return window is the only real remedy.** This is a used machine bought
  from a Shopee seller under 蝦皮安心退. A fault found this week is a refund; the
  same fault found next month is a repair at your own cost. Every check below
  exists to be run while returning it is still an option.
- **Windows answers most of these more easily than Linux does**, with tools that
  need no network, no drivers and no install — which matters when the box has
  not been on a network yet.
- **Nothing of yours is on it.** Wiping and starting over costs nothing at this
  point, so it is the right moment to stress it.

**Most of it is done, and the machine passed.** The readings live in
[The machine](#the-machine) above — parts, [drive condition](#condition-of-the-drive)
and [firmware state](#firmware-and-disk-state-as-delivered). What each check is
for, and which three are still open:

| Check | How, in Windows | Why it matters | Result |
| --- | --- | --- | --- |
| **Is it the machine that was advertised?** i5-8500T, 16 GB, 512 GB | Right-click the taskbar → **Task Manager** → **Performance**, and **Settings → System → About** | The listing promised specific parts. Confirming them is the entire point of booting Windows first: a mismatch is a return, and only while the window is open. | ✅ All three match. 6C/6T, 9 MB L3, 16.0 GB at 2667 MHz, 477 GB SSD. |
| **Is the 16 GB `1×16 GB` or `2×8 GB`?** | Task Manager → Performance → **Memory**; read **"已使用插槽: 2 (總共 2)"** | One stick leaves the second SO-DIMM slot free, so 32 GB later costs one module instead of two. Two sticks means any upgrade is a full replacement. Worth knowing before RAM prices move again. | ⚠️ **2 × 8 GB, both slots used.** 32 GB means buying 2 × 16 GB and retiring both existing sticks. The consolation is that it runs dual-channel. |
| **SSD health and power-on hours** | [CrystalDiskInfo](https://crystalmark.info/) — free, portable, no install needed | It is a used drive of unknown age holding the only copy of the covers and, more importantly, the only copy of every uploaded image in `static/library/` — covers can be re-fetched, uploads cannot. Read **Health Status**, **Power On Hours** and **Total Host Writes**. Anything other than a Good/正常 health status is a return, not a risk to accept. Over ~20,000 hours is a well-used drive — fine, but plan the backup accordingly. | ✅ 97 %, 4,325 h, zero reallocated or uncorrectable sectors — see [Condition of the drive](#condition-of-the-drive). |
| **SATA mode** | `Get-CimInstance Win32_IDEController \| Select-Object Name` | If it reports RAID or Intel RST, the Ubuntu installer will find no disks. Knowing now turns [step 3](#step-3--bios-settings) into a confirmation instead of a surprise at the disk screen. | ✅ Already AHCI. |
| **Is anything on the disk worth keeping?** | `Get-ChildItem D:\ -Force`, and `Get-Partition` | The installer takes the whole disk. A used machine occasionally arrives with the previous owner's files still on a second partition. | ✅ Nothing. `D:` holds an empty recycle bin; there is no recovery partition. |
| **Does the hardware physically work?** | Plug something into each USB port, both DisplayPort outputs, and the headphone jack. Leave it running 30 minutes and listen | Used-machine faults are usually dead ports, a noisy or seized fan, or thermal shutdown under load — none of which a spec sheet shows. A machine that is loud on a desk is a machine that gets unplugged. | ✅ USB, both DisplayPorts and the headphone jack all work; quiet and 25 °C after 30 minutes. |
| **Which WiFi card is fitted?** | **Device Manager → Network adapters** | Intel cards work in the Ubuntu installer; several Realtek ones need a driver compiled after install, which cannot be done without a network. This decides whether the first setup can happen over WiFi at all — see [if no cable can reach the box](#if-no-cable-can-reach-the-box). Windows is much the easiest place to learn this, and the answer is gone once it is erased. | **Open** |
| **The Ethernet MAC address** | Device Manager, or the PowerShell block below | Needed for the DHCP reservation in [step 10](#step-10--give-it-a-fixed-address-on-the-router). Writing it down now saves a trip back to the console later. | **Open** — obtainable later from Linux, unlike the rest. |
| **PSU is the genuine HP unit** | Look at the label on the brick | Listed as 原廠; third-party bricks on these are a known source of instability, and the proprietary barrel plug makes a replacement awkward. | **Open** |
| **Serial number and BIOS version** | **Settings → System → About**, or the block below | The serial dates the machine on HP's support site, which is the only honest answer to "how old is this really". The BIOS version tells you whether an update is worth applying before Linux goes on. | **Open** |

**The three still open are the reason not to erase Windows yet.** The WiFi card,
the PSU label and the serial/BIOS pair are all cheaper to read here than
anywhere else, and two of them stop being readable at all once the disk is
wiped.

Most of the software answers come out of one PowerShell window (right-click
Start → **Windows PowerShell**):

```powershell
# RAM: one row per stick fitted — one row means a free slot
Get-CimInstance Win32_PhysicalMemory |
  Select-Object DeviceLocator, @{n='GB';e={$_.Capacity/1GB}}, Speed, Manufacturer, PartNumber

# CPU
Get-CimInstance Win32_Processor | Select-Object Name, NumberOfCores, MaxClockSpeed

# Disks and their health
Get-PhysicalDisk |
  Select-Object FriendlyName, MediaType, HealthStatus, @{n='GB';e={[math]::Round($_.Size/1GB)}}

# Network cards and MAC addresses — note the Ethernet one for the DHCP reservation
Get-NetAdapter | Select-Object Name, InterfaceDescription, MacAddress, Status

# Serial number and BIOS
Get-CimInstance Win32_BIOS | Select-Object SerialNumber, SMBIOSBIOSVersion, ReleaseDate

# SATA mode — anything naming RAID or Intel RST means the BIOS needs changing
Get-CimInstance Win32_IDEController | Select-Object Name

# Partitions, and whether the second one holds anything of the previous owner's
Get-Partition | Select-Object DiskNumber, PartitionNumber, DriveLetter, Type,
  @{n='GB';e={[math]::Round($_.Size/1GB,1)}}
Get-ChildItem D:\ -Force
```

Write the answers down somewhere outside this machine — they are wanted again
when buying RAM, when setting the DHCP reservation, and when the drive
eventually needs replacing.

**If any of this fails, stop and return the machine.** Nothing in this document
is urgent enough to justify building a server on a drive that reports Caution or
a fan that screams. The seller's return window is short.

**Finish the open checks before phase D erases the disk.** The BIOS step is
harmless here — SATA mode is already AHCI, so nothing phase C changes stops
Windows booting — but the install in phase D takes the whole drive, and with it
every answer that only Windows holds.

#### What cannot be answered until Linux is running

| Check | How | Why later |
| --- | --- | --- |
| Actual idle power | A plug-in power meter at the wall, once the box is installed, headless and idle | Expect roughly 8-12 W. Windows idles differently from a headless Linux server, so a measurement taken now would not describe the thing that actually runs 24/7. Worth doing once, since it is on all the time. |
| A SMART baseline to compare against | `sudo smartctl -a /dev/sda`, in [step 9](#step-9--finish-the-hardware-checks) | Duplicates what CrystalDiskInfo already showed, but it is the reading in the form you will see it in from then on. Keep it. |

#### What the WiFi-card answer decides

If the box cannot reach the router with a cable for its first setup, the card
named in Device Manager decides which of the alternatives in
[phase D](#phase-d--install-ubuntu) is worth trying:

- **Intel** (`Wireless-AC 9560`, `AX200`, ...) — driver and firmware ship in the
  Ubuntu installer. WiFi will appear in the network step and work. This is what
  these HP boxes usually have.
- **Realtek** (`RTL8821CE`, `RTL8822BE`, ...) — expect trouble. Several of these
  need an out-of-tree driver compiled *after* install, which is a chicken-and-egg
  problem: the network is needed to fix the network. Use USB tethering instead
  and do not spend an evening on it.
- **Qualcomm / Atheros** — usually fine.

Once Windows is erased this is much harder to answer, which is why it is the one
arrival check that has to happen first.

### Phase C — Set the BIOS

*At the box, monitor and keyboard. **Only once phase B is finished** — the first
setting here stops the pre-installed Windows from booting.*

#### Step 3 — BIOS settings

These are set on the box itself, in its firmware, and they have to be right
*before* the installer boots — the first one decides whether the installer can
see the drive at all. Press **F10** at power-on to get in.

1. **SATA mode → AHCI.** This box is **already AHCI**, so confirm it and move
   on. It is listed first because RAID / Intel RST is the single most common
   way this install goes wrong on these HP machines: the installer reaches the
   disk step and reports that there are no disks. Changing the mode would also
   stop the pre-installed Windows booting — not a concern here, since nothing
   needs changing.
2. **After Power Loss → Power On.** The default is to stay off. For an
   always-on server this is the difference between a brief power cut and a trip
   home to press a button.
3. **Wake on LAN** — leave enabled if remote power-on is ever wanted; harmless.
4. **Secure Boot** — Ubuntu supports it, so it can stay on. Turn it off only if
   an out-of-tree driver later needs it.
5. Set a BIOS password if the box will be physically reachable by others.

Save and exit (**F10**), and leave the USB stick plugged in.

### Phase D — Install Ubuntu

*At the box, monitor and keyboard, for the last time. SSH is switched on during
this phase, inside the installer — not afterwards.*

#### Step 4 — Boot the installer

Power on and press **F9** repeatedly for the one-time boot menu. Choose the entry
for the USB stick that begins with **`UEFI:`** — there may be two entries for the
same stick, and the non-UEFI one installs a legacy-boot system that will not
match the GPT layout chosen in Rufus.

At the GRUB menu, take **Try or Install Ubuntu Server** (the default; it boots on
its own after a few seconds). Text scrolls for a minute or two. If the installer
offers an update to itself, **decline it** — the shipped version is fine and
updating adds a failure mode.

#### If no cable can reach the box

*Read this before step 5 if the box is not next to the router. The installer's
network screen is where the choice is made, and it cannot be skipped — the
installer downloads updates.*

**The end state is the cable.** A server that lives in one place, runs unattended
and holds a long-lived outbound tunnel belongs on Ethernet: WiFi drops are the
difference between a machine that recovers on its own and a machine that has to
be walked over to. Everything below is about the *first* setup, when the box may
not yet be sitting anywhere near the router.

All three options work. They differ in how much can go wrong.

| Option | Good for | Cost |
| --- | --- | --- |
| **Phone hotspot (WiFi)** | The simplest if the WiFi card is Intel. The installer's network screen handles it like any other network. | Mobile data, and the SSH caveat below. |
| **USB tethering from the phone** | The reliable fallback. The installer sees an ordinary *wired* interface, so the WiFi card and its driver are out of the picture entirely. | A USB data cable. Same mobile data. |
| **Powerline adapters** | If the box will permanently live far from the router. Not a setup trick — an actual fix. | About NT$1,000. |

##### What the installer's WiFi step can and cannot do

At **Network connections**, a `wlp*` interface is listed beside the wired one.
Select it, pick the SSID, enter the passphrase, and **wait for an IPv4 address to
appear** before continuing — the installer downloads updates and a half-connected
network fails later, in a less obvious place.

Three hard limits:

- **WPA2-Personal only.** No WPA-Enterprise, no captive portals, nothing that
  needs a "click here to accept" page.
- **Hidden SSIDs** are not listed and are awkward to add.
- 2.4 GHz vs 5 GHz makes no difference to anything here; prefer 2.4 GHz for range.

The result is written to `/etc/netplan/50-cloud-init.yaml`:

```yaml
network:
  version: 2
  wifis:
    wlp2s0:
      dhcp4: true
      access-points:
        "YourSSID":
          password: "your-passphrase"
```

`sudo netplan apply` reloads it, and `sudo apt install wpasupplicant` is the
missing piece if WiFi is ever configured from the console after install. **That
file contains the WiFi password in plain text — `sudo chmod 600` it.**

##### USB tethering from the phone

The phone's USB-C port to any of the box's rear USB-A ports (or its front Type-C
port), then on the phone: **Settings -> Connections -> Mobile Hotspot and
Tethering -> USB tethering**. The toggle only becomes available once the cable is
plugged into a computer.

Linux sees this as a normal wired interface (`usb0`, or an `enx...` name), so it
needs no driver and no configuration — the installer's network screen shows it
with an address already. It is the most reliable of the three options.

**The cable must be a data cable.** Charge-only USB cables exist, carry no data
lines, and fail silently — the phone charges and no interface appears. If USB
tethering seems to do nothing, suspect the cable before anything else.

##### If the network is a phone, plan for it disappearing

Both phone options share three consequences worth deciding before starting, not
after:

1. **SSH means joining the same network.** To reach the box from a laptop over
   the hotspot, that laptop has to be on the hotspot too. Some phones isolate
   hotspot clients from each other, which blocks this with no error — just a
   timeout. If it does not work, use the monitor and keyboard for the setup
   rather than debugging it.
2. **The network vanishes when the phone leaves.** The box is then on a network
   that no longer exists, with no way in except a monitor. Expect to redo the
   network configuration at the console once it reaches its permanent home, and
   keep the monitor and adapter to hand until the cable is in.
3. **Mobile data.** Rough budget for the whole bring-up: 200-500 MB for the
   install and its updates, a few hundred MB more for `apt full-upgrade`, ~150 MB
   for Docker, and ~150 MB for the `postgres:17` image later. **Call it 1-2 GB.**
   Not a problem on an unlimited plan; worth knowing on a metered one.

Samsung phones have a **Wi-Fi sharing** toggle in the Mobile Hotspot settings
that shares the phone's own WiFi connection instead of its mobile data. If the
phone can reach the home WiFi and the mini PC cannot yet, that turns the phone
into a bridge and costs no mobile data at all.

#### Step 5 — The installer, screen by screen

Navigation is keyboard-only: arrow keys to move, `Space` to toggle a checkbox,
`Enter` or `Tab` to reach `Done`. There is no mouse.

| Screen | What to choose | Why |
| --- | --- | --- |
| Language | English | Keeps error messages searchable. |
| Keyboard layout | English (US) | Matches most keyboards sold here. |
| Type of install | **Ubuntu Server** | Not "Ubuntu Server (minimized)" — minimized strips editors and diagnostic tools that are wanted when something is broken at 1am. |
| Network | Leave it on DHCP; confirm an IPv4 address appears next to the wired interface. On WiFi or a phone, see [just above](#if-no-cable-can-reach-the-box) | If no address appears, the cable or the port is the problem — fix it here, since the installer downloads updates. The fixed address comes later as a router reservation, not as a static IP set on the box. |
| Proxy | Blank | |
| Mirror | Accept the default, or a `tw.archive.ubuntu.com` mirror if offered | Only affects download speed. |
| Storage: guided | **Use an entire disk**; tick **Set up this disk as an LVM group**; leave **encrypt the LVM group with LUKS** unticked | LVM is free flexibility: it makes it possible to grow the filesystem onto one of the two spare M.2 slots later without a reinstall. **Encryption must stay off** — it demands a passphrase typed on a physical keyboard at every boot, which directly defeats the "After Power Loss → Power On" BIOS setting and makes an unattended reboot impossible. |
| Storage: summary | Read it once, then confirm the destructive-write warning | This is the point of no return for the existing Windows install. |
| Profile | Your name; **server name `media`**; a username that is **not** `admin`, `ubuntu` or `root`; a real password | The server name becomes the shell prompt and the hostname on the network. `admin` and `ubuntu` are the two names automated scanners try first. |
| Ubuntu Pro | **Skip for now** | Free for personal use on up to five machines and can be enabled at any time later with `sudo pro attach`. It is not needed to get running. |
| **Install OpenSSH server** | **Tick it.** Then choose **Import SSH identity → from GitHub** and enter the GitHub username | This is the most important checkbox in the installer. Without it the machine has no remote access and the rest of the setup happens hunched over a keyboard. Importing the GitHub key means logging in from the dev machine with no password at all. |
| Allow password authentication over SSH | **No**, if the key import succeeded | Key-only login removes the entire class of password-guessing attacks. Say yes only if no key was imported, and then fix it later. |
| Featured server snaps | **Select nothing.** Press `Done` | Docker is on this list — do not take it. The snap version is confined in ways that make bind mounts and volumes behave differently from every tutorial and from the compose file this project will use. It gets installed from apt in step 7. |

Then it installs. When the log stops and the button reads **Reboot Now**, take
it, and **pull the USB stick out** when asked. If the machine boots back into the
installer, the stick was still in, or the BIOS boot order still prefers it.

First boot ends at a plain text login prompt. That is the finished, correct
state — there is no graphical desktop coming.

### Phase E — Finish the setup over SSH

*At the dev machine, typing into an SSH session. The monitor, keyboard and
adapter come off the box at the start of this phase and do not go back on.*

#### Step 6 — Get in over SSH and stop using the monitor

On the box, log in at the console once and read its address:

```bash
ip -4 addr show
```

The line beginning `inet` under the wired interface (`enp0s31f6` or similar)
holds it, in the form `192.168.x.y/24`. Note the address.

Now from the dev machine, in PowerShell or Git Bash:

```bash
ssh <username>@192.168.x.y
```

Accept the host-key fingerprint prompt the first time. If the GitHub key import
worked, this logs straight in with no password. **From here on the monitor,
keyboard and adapter can be unplugged** — everything else is done over SSH, and
that is how the machine will be administered from now on.

If the connection is refused, OpenSSH was not ticked in the installer. Fix it at
the console with `sudo apt install openssh-server`.

#### Step 7 — Base packages and Docker

Update everything first:

```bash
sudo apt update && sudo apt full-upgrade -y
```

Then install the tools the arrival checks need, plus Docker. **Use Docker's own
apt repository**, not the `docker.io` package in the Ubuntu archive: the upstream
engine is newer, and it is the source that provides `docker-compose-plugin`,
which is the `docker compose` command this project's compose file will be run
with.

```bash
sudo apt install -y smartmontools dmidecode ca-certificates curl

# Docker's signing key and repository
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
  -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] \
https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
  | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io \
  docker-buildx-plugin docker-compose-plugin
```

Docker's repository can lag a brand-new Ubuntu release by a few weeks. If
`sudo apt update` reports **404** for the Docker repository, the packages for
this release are not published yet. Delete
`/etc/apt/sources.list.d/docker.list`, run `sudo apt update` again, and use
Ubuntu's own packages instead:

```bash
sudo apt install -y docker.io docker-compose-v2
```

They provide the same `docker compose` command. **Note that Ubuntu's package is
called `docker-compose-v2`, not `docker-compose-plugin`** — that name exists only
in Docker's repository, and asking apt for it will simply fail.

Either way, finish by letting the normal user run Docker without `sudo`, and make
sure it starts at boot:

```bash
sudo usermod -aG docker $USER
sudo systemctl enable --now docker
```

The group change only takes effect on a new login: **log out and back in**
(`exit`, then `ssh` again), then confirm:

```bash
docker run --rm hello-world
```

If that prints a welcome message without `sudo`, Docker is correctly installed. A
`permission denied ... /var/run/docker.sock` error means the re-login did not
happen.

#### Step 8 — Housekeeping

```bash
sudo timedatectl set-timezone Asia/Taipei
sudo apt install -y unattended-upgrades
sudo dpkg-reconfigure -plow unattended-upgrades   # answer Yes
```

Automatic security updates matter more here than on a laptop, because this
machine is exposed and rarely logged into.

**Do not enable `ufw` yet.** With a Cloudflare Tunnel nothing inbound is opened
in the first place, and turning on a firewall before confirming the SSH rule is
correct is the classic way to lock oneself out of a headless box.

Ubuntu Server does not suspend or sleep on its own, so nothing needs disabling
there.

#### Step 9 — Finish the hardware checks

Most of [phase B](#phase-b--inspect-the-machine-in-the-bundled-windows) was answered from the
bundled Windows before it was wiped. Two things are left, and this is the moment
for both — the machine is finished but still holds nothing, so a bad drive is
still a return rather than a restore.

**Measure the idle power** at the wall with a plug-in meter, now that it is
headless, installed and doing nothing. Expect 8-12 W. This is the number that
matters, because it is the state the box spends its life in.

**Take a SMART baseline** in the form you will read it in from now on.
`smartmontools` and `dmidecode` were installed in step 7:

```bash
sudo smartctl -a /dev/sda | grep -i "power_on\|health\|reallocated"
sudo dmidecode -t memory | grep -A2 "Memory Device"    # should show two 8 GB sticks
```

The drive is SATA, not NVMe, so it is `/dev/sda` — `/dev/nvme0n1` does not
exist on this box. Compare the readings against
[Condition of the drive](#condition-of-the-drive): health, 4,325 power-on hours
and zero reallocated sectors. The memory output should show two 8 GB sticks. If
either disagrees with what Windows reported, trust this one and re-read
everything, since something was misread the first time.

#### Step 10 — Give it a fixed address on the router

Log in to the router and add a **DHCP reservation** binding the box's MAC address
to a fixed local IP. Find the MAC with:

```bash
ip link show
```

It is the `link/ether` value on the wired interface. **Use the Ethernet MAC, not
the WiFi one** — they differ, so a reservation made during a WiFi setup stops
applying the moment the cable goes in.

The tunnel does not need this — `cloudflared` dials out. SSH and `psql` from a
laptop do, and an address that changes after a power cut is an afternoon lost.
Set the reservation rather than configuring a static IP on the box itself: one
place to look, and no chance of a clash with the router's own pool.

#### Step 11 — Once the cable is in, if setup used WiFi

Two things to do at that point, neither of which is automatic:

- **Set the DHCP reservation on the Ethernet MAC, not the WiFi one** — they are
  different addresses, so a reservation made over WiFi stops applying the moment
  the cable goes in, and the box moves. Do the reservation last (step 10), once
  the cable is the connection it will keep. Reserving both MACs to one address is
  the alternative.
- **Remove the `wifis:` block** from `/etc/netplan/50-cloud-init.yaml` and
  `sudo netplan apply`. A machine quietly holding two routes onto the network is
  a machine whose address is hard to explain a year later — and it leaves the
  WiFi password on disk for no reason.

### When this is done

The box is ready for the next build-order step when all of these are true:

- [ ] `ssh <user>@<fixed-ip>` from the dev machine logs in with no password.
- [ ] `docker run --rm hello-world` succeeds without `sudo`.
- [ ] `docker compose version` prints a version (note the space — not
      `docker-compose`).
- [ ] `lsb_release -a` shows **26.04** — not an interim release, not an ESM one.
- [ ] The arrival checks are done — the Windows ones before wiping, the idle-power and SMART readings after — and their answers written down somewhere off this machine.
- [ ] The router shows a reservation for the box, on its **Ethernet** MAC.
- [ ] If setup happened over WiFi: step 11 is done — the `wifis:` block is out
      of the netplan file and the reservation is on the Ethernet MAC.
- [ ] The monitor and keyboard are unplugged and it still works.

Nothing from this project is installed yet, and that is correct: the app arrives
as containers in build-order step 4.

### When something goes wrong

| Symptom | Cause | Fix |
| --- | --- | --- |
| Installer says there are no disks | SATA mode is RAID / Intel RST | Unlikely on this box — it ships AHCI — so suspect a disconnected drive first. If F10 does show RAID/RST, set it to AHCI ([step 3](#step-3--bios-settings)) and start over. |
| The USB stick does not appear in the F9 boot menu | Written in a way that is not bootable, or Secure Boot objects | Rewrite with Rufus in ISO mode, GPT / UEFI. Ubuntu is signed, so Secure Boot is normally not the cause. |
| It boots the installer again after finishing | The stick was left in, or it is ahead of the SSD in the boot order | Remove the stick; if it persists, fix the boot order in F10. |
| No IPv4 address during the network step | Cable, port, or the router | Try the other end of the cable and another router port. Do not fall back to WiFi. |
| `ssh` connection refused | OpenSSH was not ticked | At the console: `sudo apt install openssh-server`. |
| No wireless interface in the network step | Realtek card, or missing firmware | Do not fight it. USB-tether the phone instead — the installer sees that as a wired interface. |
| USB tethering does nothing | Charge-only USB cable, or the toggle was flipped before plugging in | Use a known data cable; enable USB tethering *after* the cable is connected. |
| `ssh` asks for a password | The GitHub key import did not happen | `ssh-copy-id <user>@<ip>` from the dev machine, then disable password auth. |
| `permission denied ... docker.sock` | The docker group membership is not active in this session | Log out and back in. |
| `apt` 404 on the Docker repository | Docker has not published for this Ubuntu release yet | Remove `/etc/apt/sources.list.d/docker.list` and use `docker.io` + `docker-compose-v2`. |
| Locked out entirely | — | Plug the monitor and keyboard back in. Physical access always wins; this is why the box lives at home. |

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

### What does need planning: backups, not capacity

280 MB is small enough that a complete off-box backup is trivial — a nightly
`pg_dump` plus an rsync of `static/covers/` and `static/library/` (which
includes `static/library/thumbs/`) is a couple of hundred megabytes today,
comfortably inside Cloudflare R2's free tier, though `static/library/` grows
with every upload in a way the cover directories do not, so that figure is a
floor rather than a fixed one. Since these directories will exist on exactly
one disk in this box, this is the part of the storage story that actually
carries risk. **A second copy is not optional.**

The two halves of that copy are not equally recoverable. A missing cover is
an inconvenience — `download-missing-covers` re-fetches it from MAL, TMDB,
Comic Vine and friends. A missing uploaded image is permanent: nothing
re-fetches it, uploads never travel through the Google Sheets Backup/Pull
pipeline (which carries the reference, not the bytes), and `static/library/`
is the only copy anywhere. That asymmetry is the reason to actually verify
the nightly sync runs, not just that it is configured.

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
| OS | Ubuntu Server LTS (or Debian stable), with Docker + Compose on top. Install procedure: [Bringing up the box](#bringing-up-the-box). |
| App container | The existing `dockerfile`, unchanged. `entrypoint.sh` already runs `alembic upgrade head` and then `uvicorn ... --port ${PORT:-8080} --proxy-headers --forwarded-allow-ips='*'`, which is exactly right behind a tunnel. |
| Database | A `postgres` container with a named volume on the SSD, replacing Cloud SQL. **Version settled: `postgres:17`**, matching `docker-compose.yml`, the CI service container and both dev machines since 2026-09-08. |
| Ingress | A `cloudflared` container in the same Compose project, pointing at the app container's port |
| Covers | A bind mount for `static/covers/` (235 MB). Both halves are settled: the backend writes and serves from there unconditionally (the GCS arm and `GCP_BUCKET_NAME` were deleted on 2026-09-08), and `getCoverUrl` now returns `/static/covers/<key>` on every host. Nothing left to change here. |
| Uploaded images | A bind mount for `static/library/` (files at `static/library/<sha256>.jpg`, thumbnails under `static/library/thumbs/`). These never travel through the Google Sheets pipeline and cannot be re-fetched from anywhere, unlike covers, so this directory needs the same bind mount and backup treatment as covers, not less. |
| Backup | A nightly `pg_dump` plus an off-box copy of `static/covers/` and `static/library/`. The existing Google Sheets backup is unaffected by all of this and keeps working, but it carries references only — it is not a substitute for backing up `static/library/` itself. |

Connection string note: with the database in a sibling container, set
`DATABASE_URL=postgresql://<user>:<pass>@db:5432/<db>` — the host must be the
container name, not `localhost`.

> **`DATABASE_URL` is now honoured verbatim.** `app/config.py` used to ignore a
> `DATABASE_URL` containing `localhost`, as a guard against a leaked local
> `.env` reaching the container. That guard was removed on 2026-09-08 along
> with the rest of the Cloud Run code: `sqlalchemy_database_url` returns
> `DATABASE_URL` exactly as written when it is set, and only falls back to a
> localhost URL built from the `POSTGRES_*` values when it is not. A stale
> `DATABASE_URL` left in a machine's `.env` will therefore be used and will
> break that machine — this happened on the home machine on 2026-09-08 and had
> to be commented out. Check `.env` first when a machine suddenly cannot reach
> its database.

## Build order

Nothing below is done yet. Roughly dependency-ordered; the code changes can
proceed in parallel with the hardware bring-up.

1. **Bring up the box** — BIOS settings, Ubuntu Server LTS, Docker, SSH keys,
   DHCP reservation. This is now written out screen by screen in
   [Bringing up the box](#bringing-up-the-box); follow that
   section rather than this line, and stop at its "When this is done" checklist.
2. **Verify the hardware** — phase B of that section, in the bundled Windows,
   before anything is erased and while the machine can still be returned.
3. ~~**Build the production signal**~~ — **done on 2026-09-10.** `APP_ENV`
   exists, the cookie's `Secure` flag follows it, and the secret-defaults check
   runs in every environment rather than hanging off the signal. The production
   `docker-compose.yml` in step 4 must set `APP_ENV=production`, and must set
   real `JWT_SECRET_KEY` and `ADMIN_PASSWORD` values or the container will
   refuse to start.
4. **Write the production `docker-compose.yml`** — app + postgres + cloudflared,
   named volume for the database, bind mounts for `static/covers/` and
   `static/library/`.
5. **Load the data** — restore the database, copy `static/covers/` and
   `static/library/` across. The version is settled at 17, so a dump from a
   dev machine restores cleanly.
6. **Domain and tunnel** — register `cg1618.com` at Cloudflare Registrar (the
   zone comes with Cloudflare nameservers already set), create the tunnel, then
   `cloudflared tunnel route dns` for the chosen hostname.
7. **Backups** — nightly `pg_dump` + a sync of `static/covers/` and
   `static/library/` to R2, and verify a restore actually works before relying
   on it. The `static/library/` half of that sync is the one that matters most:
   it is the only copy of every uploaded image in existence.

## What has to change in the code

**Partly done.** On 2026-09-08 the GCP code was removed from the repository
(the inventory is in [deployment-gcp.md](deployment-gcp.md)), which settled the
cover-image half of this list and changed the shape of the other half.

The production signal was built on 2026-09-10 and the first two rows below are
now closed. `APP_ENV` names the runtime and defaults to **production** when
unset, so a box that is never told what it is gets the hardened behaviour
rather than the lax one; `Settings.validate_secrets()` refuses to start on a
default `JWT_SECRET_KEY` or `ADMIN_PASSWORD` in every environment, deliberately
**not** gated on the signal. See
[authentication.md](authentication.md#the-production-signal-app_env).

**What remains before exposing the box to the Internet:**

| Location | State today | Why it matters here |
| --- | --- | --- |
| `app/routers/auth.py` | **Done.** `secure=not settings.is_development`, so the flag is on wherever `APP_ENV` is not `development`. Deliberately not scheme-conditional: behind the tunnel the scheme is only trustworthy if proxy headers are right, and a missing header would fail exactly as quietly as the old hard-coded `False`. | Set `APP_ENV=production` in the compose file and the flag is on. |
| `app/config.py` | **Done.** `Settings.validate_secrets()` runs as the first statement of the lifespan - before the `try` that swallows seeding errors, and before the admin account is seeded from `admin_password`. Not gated on `APP_ENV`, because gating the old check on Cloud Run is precisely why it never fired. | A container started without real secrets exits at startup with both problems named. Verified by booting with the defaults. |
| `app/config.py` (`sqlalchemy_database_url`) | `DATABASE_URL` is honoured **verbatim** when set; otherwise a localhost URL from `POSTGRES_*`. | Fine for a container pointed at `db:5432`, but the old "ignore a localhost URL" guard is gone — see the warning under [Intended runtime shape](#intended-runtime-shape). |
| Covers (backend) | **Done.** `image_manager.py` writes and reads `static/covers/<owner_type>/<system_id>.jpg` with no bucket branch; `GCP_BUCKET_NAME` and `app/utils/gcp_utils.py` no longer exist. | Nothing to configure. A bind mount for that directory is all the deployment needs. |
| `frontend/src/lib/covers.js` (`getCoverUrl`) | **Done.** Returns `/static/covers/<coverFile>` on every host; the `storage.googleapis.com` URL and the hard-coded `BUCKET_NAME` are gone. | This was the blocker that would have blanked every cover behind the tunnel. It is fixed. |
| `frontend/src/lib/covers.js` (`getQuoteImageUrl`) | Still gated on `isLocalHost()`, still returns `null` off localhost. | Left in place deliberately — see [Cover images](#cover-images-the-backend-and-the-frontend-are-both-local-now). Worth revisiting on a box with a persistent disk. |

The first two were one design decision, taken on 2026-09-10 and **half**
implemented the way this section proposed. `APP_ENV` is the explicit signal the
cookie flag reads. The fail-fast check deliberately does **not** read it: a
single variable gating both protections is one thing you can forget, and
forgetting it would disable the secret check as well as the cookie flag —
which is the shape of the failure that produced this list. Django splits them
the same way, requiring `SECRET_KEY` regardless of `DEBUG`.

### Cover images: the backend and the frontend are both local now

**Settled as of 2026-09-08. Nothing here is outstanding.** An earlier draft of
this file called covers "the largest piece of work in the migration"; a later
one narrowed it to one broken function in the frontend. Both halves are now
done, and by deletion rather than by adding configuration.

**The backend is local-only.** Every function in
`app/services/integrations/image_manager.py` — `download_cover_image`,
`cover_image_exists`, `list_all_cover_images` and `delete_cover_image` — writes
and reads `static/covers/<owner_type>/<system_id>.jpg` on disk with no branch.
The `if bucket_name:` GCS arm was removed and `app/utils/gcp_utils.py` deleted
outright, so there is no bucket to leave unset. `app/main.py` mounts `/static`,
so the files are served by the app itself. The 235 MB in `static/covers/` is
the whole store.

**The frontend matches it.** `frontend/src/lib/covers.js`:

```js
export function getCoverUrl(coverFile) {
  if (!coverFile || coverFile === "N/A") return FALLBACK_SVG;
  return `/static/covers/${coverFile}`;
}
```

No hostname test, no `BUCKET_NAME`, no `storage.googleapis.com`. Behind the
tunnel at a real hostname the covers resolve from the same origin as the app,
which is what self-hosting needs. All the deployment has to do is bind-mount
the directory and include it in the backup — and the same is true of
`static/library/`, where uploaded images live; unlike covers, nothing can
re-fetch an uploaded image if that directory is lost.

`getQuoteImageUrl` just below it still has the old hostname gate and still
returns `null` off localhost, because Cloud Run's filesystem was ephemeral and
uploads would vanish on restart. **That rationale disappears on this box, which
has a persistent disk**, so the gate was deliberately left in place rather than
removed blind — quote images could simply work. Decide it as part of the
self-hosting change.

#### Local disk or R2 — decided: local disk

1. **Local disk** — what the code does, and now the only thing it can do. Zero
   third parties, and covers load from the same origin as the app. The cost is
   that the images live on one disk and must be part of the backup story —
   more so for `static/library/`, the uploaded-image store, than for covers:
   a lost cover is re-fetchable, a lost upload is not.
2. **Cloudflare R2** — S3-compatible, free at this volume, already inside the
   Cloudflare account the tunnel needs, and it would survive the box dying. But
   there is no object-storage client left in the codebase at all now
   (`gcp_utils.py` is deleted, `google-cloud-storage` is out of
   `requirements.txt`), so choosing R2 as the *primary* store means building a
   storage seam from nothing, plus credentials and a bucket to manage.

**Local disk is the decision**, with R2 as the off-box *backup* target rather
than the primary store — which also answers the backup question above. At
235 MB for covers, plus whatever `static/library/` has grown to, a nightly
sync to R2 costs nothing and keeps the copy that matters — decisively so for
`static/library/`, since it is the only copy of every uploaded image.

## Open questions

- How "production" is signalled, now that there is no production concept in the
  code at all — see [What has to change in the code](#what-has-to-change-in-the-code).
  This is the one that blocks exposing the box.
- What the apex `cg1618.com` serves — a landing page linking the projects, or
  a redirect to one of them.
- Whether `journal`, `health` and `money` get Cloudflare Access in front of
  them or no public hostname at all (see [Planned hostnames](#planned-hostnames)).
- Whether `getQuoteImageUrl` is fixed alongside `getCoverUrl` so quote images
  work on a box with a persistent disk.

### Settled since this list was written

- **Cover storage** — local disk, decided and implemented; see above.
- **CI** — `.github/workflows/deploy.yml` is now `ci.yml` and the deploy job is
  gone, so CI is tests only. It gains no self-hosted path.

Settled since this list was written:

- **Cover storage: local disk.** Backend and frontend both do it
  unconditionally; R2 is the backup target, not the store. See
  [Cover images](#cover-images-the-backend-and-the-frontend-are-both-local-now).
- **CI: tests only.** `.github/workflows/deploy.yml` was renamed to
  `ci.yml` and the deploy job deleted on 2026-09-08, so there is nothing to
  retire. A self-hosted deploy path, if it is ever wanted, is new work — most
  likely a pull on the box rather than a push from CI.

## See also

- [deployment-gcp.md](deployment-gcp.md) — the deployment this replaces, and
  the reference for the container image and CI that carry over unchanged.
- [setup-local.md](setup-local.md) — local development, unaffected.
- [external-apis.md](external-apis.md) — Sheets and the metadata APIs.
