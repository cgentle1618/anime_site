# Setting up the self-hosted production box

Last verified: 2026-09-15 (steps 1-17 followed end to end; the box it produced
is serving `media.cg1618.com`)

Everything from an unopened used mini PC to a machine serving the application
over HTTPS, written for someone who has never installed Linux: every screen,
every answer, and what to do when an answer is wrong.

**This is the procedure. What it produces is described in
[deployment-selfhost.md](deployment-selfhost.md), and how to operate the result
day to day is [deploy/README.md](../deploy/README.md).** Read this one only when
building a box.

**It is written for one specific machine** — an HP ProDesk 600 G4 Desktop Mini
with an Intel I219-LM, an Intel Wireless-AC 8265 and a SATA SSD — because a
procedure you can follow without thinking is worth more than one that covers
hardware you do not have. On different hardware the shape holds and the
specifics will not: BIOS menus move, the network interface names change, and
`/dev/sda` might be `/dev/nvme0n1`.

Budget about two hours. Most of it is waiting — a 3 GB download, a container
build, and one deliberate 30-minute soak test.

## What this produces

| | |
| --- | --- |
| OS | Ubuntu Server 26.04.1 LTS, hostname `homelab`, key-only SSH |
| Runtime | Docker with three containers: `postgres:17`, the app, `cloudflared` |
| Ingress | A Cloudflare Tunnel. **No inbound port is opened anywhere** |
| Data | Restored from a `pg_dump` of a development machine |
| Recovery | Survives a power cut and a network outage with nobody present |

## The six phases

The work moves between two machines, and most confusion about this procedure is
really confusion about which one you are sitting at. Do them in order — each
phase is a heading below, with its steps under it.

| Phase | Where you are | Steps | What happens |
| --- | --- | --- | --- |
| **[A. Prepare the stick](#phase-a--prepare-the-usb-stick)** | At the dev machine | 1-2 | Download the ISO, write the USB. Touches nothing on the box. |
| **[B. Inspect](#phase-b--inspect-the-machine-in-the-bundled-windows)** | At the box, in **the bundled Windows** | — | Every check that needs Windows, run before anything is changed. Ends with a keep-or-return decision. |
| **[C. Set the BIOS](#phase-c--set-the-bios)** | At the box, monitor and keyboard | 3 | Firmware settings. **After phase B, never before.** |
| **[D. Install Ubuntu](#phase-d--install-ubuntu)** | At the box, monitor and keyboard | 4-5 | Boot the installer and answer its screens. **SSH is switched on here**, inside the installer. |
| **[E. Finish over SSH](#phase-e--finish-the-setup-over-ssh)** | At the dev machine, over SSH | 6-11 | Docker, housekeeping, the hardware readings, the network fixes. The monitor comes off at the start of this phase and does not go back on. |
| **[F. Deploy the application](#phase-f--deploy-the-application)** | At the dev machine, over SSH | 12-18 | The checkout, the data, the tunnel, the backup sheet, off-box backups, and the tests that prove it recovers. |

The two sections before phase A are reading, not doing: which Ubuntu, and what
to have on the desk.

**Three things that are easy to get wrong, and each cost real time when they
were:**

- **SSH is not a later step.** "Install OpenSSH server" and the GitHub key
  import are a checkbox on one of the installer's own screens (step 5). By
  first boot, SSH is already running with your key already installed. Step 6
  does not set it up; it is the moment you first *use* it and put the monitor
  away.
- **Phase B has to be finished before phase D.** The install erases the bundled
  Windows, and with it the easiest way to inspect a machine that can still be
  returned — the WiFi card model and the serial/BIOS pair are read there or not
  at all.
- **The application container must not start before the database is restored**
  ([step 14](#step-14--load-the-data)). It creates every table on an empty
  database, and the restore then collides with tables that already exist.

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
[The machine](deployment-selfhost.md#the-machine) above — parts, [drive condition](deployment-selfhost.md#condition-of-the-drive)
and [firmware state](deployment-selfhost.md#firmware-and-disk-state-as-delivered). What each check is
for, and which three are still open:

| Check | How, in Windows | Why it matters | Result |
| --- | --- | --- | --- |
| **Is it the machine that was advertised?** i5-8500T, 16 GB, 512 GB | Right-click the taskbar → **Task Manager** → **Performance**, and **Settings → System → About** | The listing promised specific parts. Confirming them is the entire point of booting Windows first: a mismatch is a return, and only while the window is open. | ✅ All three match. 6C/6T, 9 MB L3, 16.0 GB at 2667 MHz, 477 GB SSD. |
| **Is the 16 GB `1×16 GB` or `2×8 GB`?** | Task Manager → Performance → **Memory**; read **"已使用插槽: 2 (總共 2)"** | One stick leaves the second SO-DIMM slot free, so 32 GB later costs one module instead of two. Two sticks means any upgrade is a full replacement. Worth knowing before RAM prices move again. | ⚠️ **2 × 8 GB, both slots used.** 32 GB means buying 2 × 16 GB and retiring both existing sticks. The consolation is that it runs dual-channel. |
| **SSD health and power-on hours** | [CrystalDiskInfo](https://crystalmark.info/) — free, portable, no install needed | It is a used drive of unknown age, and it will hold the only local copy of the images: covers can be re-fetched from the metadata APIs, but anything uploaded into `static/library/` cannot be recovered from anywhere. Read **Health Status**, **Power On Hours** and **Total Host Writes**. Anything other than a Good/正常 health status is a return, not a risk to accept. Over ~20,000 hours is a well-used drive — fine, but plan the backup accordingly. | ✅ 97 %, 4,325 h, zero reallocated or uncorrectable sectors — see [Condition of the drive](deployment-selfhost.md#condition-of-the-drive). |
| **SATA mode** | `Get-CimInstance Win32_IDEController \| Select-Object Name` | If it reports RAID or Intel RST, the Ubuntu installer will find no disks. Knowing now turns [step 3](#step-3--bios-settings) into a confirmation instead of a surprise at the disk screen. | ✅ Already AHCI. |
| **Is anything on the disk worth keeping?** | `Get-ChildItem D:\ -Force`, and `Get-Partition` | The installer takes the whole disk. A used machine occasionally arrives with the previous owner's files still on a second partition. | ✅ Nothing. `D:` holds an empty recycle bin; there is no recovery partition. |
| **Does the hardware physically work?** | Plug something into each USB port, both DisplayPort outputs, and the headphone jack. Leave it running 30 minutes and listen | Used-machine faults are usually dead ports, a noisy or seized fan, or thermal shutdown under load — none of which a spec sheet shows. A machine that is loud on a desk is a machine that gets unplugged. | ✅ USB, both DisplayPorts and the headphone jack all work; quiet and 25 °C after 30 minutes. |
| **Which WiFi card is fitted?** | **Device Manager → Network adapters** | Intel cards work in the Ubuntu installer; several Realtek ones need a driver compiled after install, which cannot be done without a network. This decides whether the first setup can happen over WiFi at all — see [if no cable can reach the box](#if-no-cable-can-reach-the-box). Windows is much the easiest place to learn this, and the answer is gone once it is erased. | ✅ Intel **Dual Band Wireless-AC 8265** — supported by the installer. |
| **The Ethernet MAC address** | Device Manager, or the PowerShell block below | Needed for the DHCP reservation in [step 10](#step-10--give-it-a-fixed-address-on-the-router). Writing it down now saves a trip back to the console later. | ✅ I219-LM, `B0-5C-DA-34-A2-0C`. |
| **PSU is the genuine HP unit** | Look at the label on the brick | Listed as 原廠; third-party bricks on these are a known source of instability, and the proprietary barrel plug makes a replacement awkward. | ✅ Genuine HP, 19.5 V. |
| **Serial number and BIOS version** | **Settings → System → About**, or the block below | The serial dates the machine on HP's support site, which is the only honest answer to "how old is this really". The BIOS version tells you whether an update is worth applying before Linux goes on. | ✅ Serial `8CC0201TF9`, BIOS `Q22 Ver. 02.35.00` (2026-07-28). |

**All of it passes; the machine is kept, and nothing further needs the bundled
Windows.** The BIOS is already the current release, which was the last reason
to keep it — so phase D can take the disk whenever the rest is ready.

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
| Actual idle power | A plug-in power meter at the wall, once the box is installed, headless and idle | Expect roughly 8-12 W. Windows idles differently from a headless Linux server, so a measurement taken now would not describe the thing that actually runs 24/7. **Skipped** — no meter, and the figure changes nothing about how the box is run; the estimate in [Running cost](deployment-selfhost.md#running-cost) stands unmeasured. |
| A SMART baseline to compare against | `sudo smartctl -a /dev/sda`, in [step 9](#step-9--finish-the-hardware-checks) | Duplicates what CrystalDiskInfo already showed, but it is the reading in the form you will see it in from then on. Keep it. |

#### What the WiFi-card answer decides

**This box has an Intel Wireless-AC 8265, so WiFi works in the installer** —
`iwlwifi` covers it and the firmware ships in `linux-firmware`, which puts it in
the first case below. If no cable reaches the box, its network screen will offer
WiFi and connect.

The card decides which of the alternatives in
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

Setting up over WiFi is a fallback, not the target state: a server that is on
all the time wants the cable, and the DHCP reservation belongs on the **Ethernet**
MAC. [Step 11](#step-11--once-the-cable-is-in-if-setup-used-wifi) is what to do
once the cable goes in.

### Phase C — Set the BIOS

*At the box, monitor and keyboard. **Only once phase B is finished** — phase D,
next, erases the disk and with it every answer only Windows can give.*

#### Step 3 — BIOS settings

These are set on the box itself, in its firmware, and they have to be right
*before* the installer boots — the first one decides whether the installer can
see the drive at all. Press **F10** at power-on to get in.

The menu is **HP Computer Setup**, four tabs — Main, Security, Advanced, UEFI
Drivers — and everything below is under **Advanced**.

1. **`Advanced → Boot Options → After Power Loss` = `Power On`.** The one
   setting that actually has to be right. For an always-on server this is the
   difference between a brief power cut and a trip home to press a button. Not
   `Previous State`: a machine that was off for an unrelated reason then stays
   off.
2. **`Advanced → Power Management Options → S5 Maximum Power Savings` must stay
   UNCHECKED.** It is off by default. Enabling it cuts power to devices in S5
   and is a known way to break both Wake-on-LAN and reliable power-on-after-
   loss — it quietly undoes setting 1, which is why it is listed second rather
   than buried.
3. **`Advanced → System Options → Configure Storage Controller for RAID` stays
   unchecked**, which is how AHCI reads on this firmware. RAID / Intel RST is
   the single most common way this install goes wrong on these HP machines: the
   installer reaches the disk step and reports that there are no disks. Nothing
   to change here — the box ships correct.
4. **`Advanced → Boot Options → USB Storage Boot` must be ticked** or the F9
   menu in [step 4](#step-4--boot-the-installer) will not list the stick. It is
   ticked by default.
5. **`Advanced → Built-In Device Options → Wake On LAN`** — `Boot to Hard Drive`
   is right; leave it.
6. **`Advanced → Secure Boot Configuration`** — Ubuntu supports it, so leave it
   enabled. Turn it off only if an out-of-tree driver later needs it.
7. **`Security`** — set a BIOS password if the box will be physically reachable
   by others. No benefit against a remote attacker.

Two optional, neither needed: **`Network (PXE) Boot`** can be unticked, since
this box will never PXE boot and it is one less network-facing firmware path;
and **`LAN / WLAN Auto Switching`** is better left off, so that which interface
is up is netplan's decision and not firmware's.

Save and exit (**Main → Save Changes and Exit**, or **F10**), and leave the USB
stick plugged in.

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
| Profile | Your name; **server name `homelab`**; a username that is **not** `admin`, `ubuntu` or `root`; a real password | The server name becomes the shell prompt and the hostname on the network. It names the **machine**, not the app: [seven projects](deployment-selfhost.md#planned-hostnames) are intended for this box, so `media` would name the host after one of its tenants. It is unrelated to the `*.cg1618.com` names, which Cloudflare resolves and the tunnel maps to ports. `admin` and `ubuntu` are the two names automated scanners try first. |
| Ubuntu Pro | **Skip for now** | Free for personal use on up to five machines and can be enabled at any time later with `sudo pro attach`. It is not needed to get running. |
| **Install OpenSSH server** | **Tick it.** Then choose **Import SSH identity → from GitHub** and enter the GitHub username | This is the most important checkbox in the installer. Without it the machine has no remote access and the rest of the setup happens hunched over a keyboard. Importing the GitHub key means logging in from the dev machine with no password at all. |
| Allow password authentication over SSH | **No**, if the key import succeeded | Key-only login removes the entire class of password-guessing attacks. Say yes only if no key was imported, and then fix it later. |
| Featured server snaps | **Select nothing.** Press `Done` | Nothing on the list belongs here. `lxd` and `microk8s` are container runtimes that would compete with Docker; `prometheus` is worth having one day, but as a container alongside everything else rather than a snap outside the compose file. Docker itself is **not** on the 26.04 list, and would be the wrong choice if it were — the snap is confined in ways that make bind mounts and volumes behave differently from every tutorial. It comes from apt in step 7. |

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

**If the box is running on WiFi, turn off the radio's power saving.** The
Wireless-AC 8265 is driven by `iwlwifi`/`iwlmvm`, which idles the radio
aggressively by default. That is correct for a laptop and wrong for a server:
it shows up as the machine being unreachable over SSH until something else
wakes the link, which reads like a dead box rather than a sleeping radio.

```bash
sudo apt install -y iw
sudo tee /etc/modprobe.d/iwlwifi.conf >/dev/null <<'EOF'
options iwlwifi power_save=0
options iwlmvm power_scheme=1
EOF
sudo reboot
```

**`power_scheme` is the one that matters.** `iwlwifi.power_save` already
defaults to `N`; it is set here only so a future change of driver default
cannot reintroduce the problem quietly. The culprit is `iwlmvm.power_scheme`,
which installs as `2` (balanced) — `1` is continuous-active. Both are
**read-only at runtime**, so this needs the reboot; there is no sysfs write
that avoids it. Check they exist before rebooting, because an invalid module
option stops `iwlwifi` loading at all, and that costs a monitor and keyboard
on a box that has neither:

```bash
cat /sys/module/iwlwifi/parameters/power_save     # N
cat /sys/module/iwlmvm/parameters/power_scheme    # 2
```

On this box the interface is **`wlp1s0`** (the wired one is `eno1`, and it
stays `DOWN` until a cable arrives). After the reboot:

```bash
cat /sys/module/iwlmvm/parameters/power_scheme   # want: 1
iw dev wlp1s0 get power_save                     # want: Power save: off
```

The symptom this fixes is latency, not an outright failure: a local ping across
the same `/24` sits around **200 ms** with power saving on, against the 1-3 ms
the link is capable of, because the radio sleeps between packets and every
request waits for it to wake.

This file is removed along with the `wifis:` block in
[step 11](#step-11--once-the-cable-is-in-if-setup-used-wifi), once the cable is
the connection the box keeps.

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
[Condition of the drive](deployment-selfhost.md#condition-of-the-drive): health, 4,325 power-on hours
and zero reallocated sectors. The memory output should show two 8 GB sticks. If
either disagrees with what Windows reported, trust this one and re-read
everything, since something was misread the first time.

#### Step 9a — Mark the unused interface optional

**A box with no Ethernet cable boots two minutes slower than it needs to, and
ends up with a permanently failed unit.** The installer writes an `eno1` entry
into `/etc/netplan/00-installer-config.yaml`, netplan generates a
`systemd-networkd-wait-online` drop-in that waits for it, and with no cable in
the socket that wait runs its full timeout and then fails:

```
2min 58ms systemd-networkd-wait-online.service
ExecStart=/lib/systemd/systemd-networkd-wait-online -i eno1:degraded
Active: failed (Result: exit-code)
```

`docker.service` is ordered after `network-online.target`, so every container
waits behind it. WiFi itself is up in about seven seconds.

The installer also leaves `eno1` with **no `dhcp4`** — only `match` and
`set-name` — so the day a cable arrives the link comes up with no address.
Both are one edit:

```yaml
  ethernets:
    eno1:
      match:
        macaddress: <the I219-LM MAC>
      set-name: eno1
      dhcp4: true
      optional: true
```

Then `sudo netplan generate`, and confirm `eno1` has left the generated
`ExecStart` in
`/run/systemd/generator.late/systemd-networkd-wait-online.service.d/10-netplan.conf`
— it should name `wlp1s0` instead, so the target still means something. The
change only takes effect at the next boot.

Measured on this box: startup **2 min 18 s → 23.6 s**, userspace
**2 min 5.7 s → 6.0 s**, containers serving **14 seconds** after boot instead
of two minutes, and `systemctl --failed` empty instead of permanently showing
one failure — which is the part that matters most, because a box that always
has a failed unit teaches you to skim past the command you would use to find a
real one.

`optional: true` does not disable the interface. It means boot need not block
on it; a cable plugged in later still gets configured, so there is nothing to
undo in [step 11](#step-11--once-the-cable-is-in-if-setup-used-wifi).

#### Step 10 — Give it a fixed address on the router

Log in to the router and add a **DHCP reservation** binding the box's MAC address
to a fixed local IP. Find the MAC with:

```bash
ip link show
```

It is the `link/ether` value on the wired interface, and on this box it should
read **`b0:5c:da:34:a2:0c`** — the I219-LM. **Use the Ethernet MAC, not the WiFi
one** (`f8:34:41:b1:ef:e5`): they differ, so a reservation made during a WiFi
setup stops applying the moment the cable goes in.

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
- **Remove the `wifis:` block** from `/etc/netplan/00-installer-config.yaml`
  — the installer writes that file, not a `50-cloud-init.yaml` — and
  `sudo netplan apply`. A machine quietly holding two routes onto the network is
  a machine whose address is hard to explain a year later — and it leaves the
  WiFi password on disk for no reason.
- **Delete `/etc/modprobe.d/iwlwifi.conf`**, the power-save override added in
  [step 8](#step-8--housekeeping). It does nothing once the radio is unused, but
  a stray module option outlives the reason it was written.

### Phase F — Deploy the application

*At the dev machine, over SSH, except where a step says otherwise. The box is a
working Docker host at this point and holds nothing of ours.*

#### Step 12 — Clone the repository and write `.env`

The repository is public, so no deploy key is needed.

```bash
ssh homelab
git clone --branch main https://github.com/cgentle1618/anime_site.git ~/anime_site
cd ~/anime_site
```

**`main`, not `dev`.** `main` is production and moves only by a release pull
request from `dev`, so cloning it is what makes that gate real: a merge to
`dev` reaches this box only once it has been promoted. `deploy.sh` pulls
whichever branch is checked out and does not name one, so the branch chosen
here is the whole of the decision.

**Write `.env` by hand. Do not copy one from a development machine** —
`DATABASE_URL` is honoured verbatim, so a stale `localhost` value silently
breaks the container. The full template is in
[deploy/README.md](../deploy/README.md); generate each secret with:

```bash
python3 -c "import secrets; print(secrets.token_urlsafe(64))"
```

Two values there decide more than they look like they do:

- **`COMPOSE_PROJECT_NAME=media`** names the volume, and therefore which
  database the stack sees. Compose otherwise derives it from the directory, so
  a checkout moved or cloned under another name comes up on a brand-new empty
  volume while the real data sits in the old one — which looks exactly like
  data loss.
- **`GOOGLE_SHEET_ID`** decides which spreadsheet Backup **overwrites**, and
  Backup overwrites every tab. Leave it empty until
  [step 17](#step-17--the-production-google-sheet). A development sheet id here
  destroys the development backup.

`GOOGLE_CREDENTIALS_JSON` takes the service-account JSON as a single line. The
`credentials.json` file that works on a dev machine is not visible to the
container, so the environment variable is the production path.

Leave `TUNNEL_ID` and `CLOUDFLARED_CREDENTIALS` empty for now; step 15 fills
them.

Then lock it down:

```bash
chmod 600 .env
```

#### Step 13 — Start the database, and only the database

```bash
docker compose -f docker-compose.prod.yml up -d db
docker compose -f docker-compose.prod.yml ps
```

Expect `media-db-1` to reach `running (healthy)` within about 30 seconds. If it
never becomes healthy, `POSTGRES_USER` or `POSTGRES_DB` in `.env` does not match
what the healthcheck asks for.

**Not `up -d`.** The application container calls `create_all` at import, so
starting it now would create every table and make the restore in the next step
collide.

If Compose reports variables "not set", the `.env` is not where it looks:
`docker-compose.prod.yml` must sit at the repository root, beside `.env`, not in
`deploy/`.

#### Step 14 — Load the data

**On the dev machine**, dump the source database:

```bash
docker exec anime_site_postgres_db pg_dump -U postgres -Fc -d anime_site_db > seed.dump
```

Copy it and the cover images across. `rsync` is better than `scp` for the
covers — nearly two thousand small files — and a streamed `tar` works if the dev
machine has no `rsync`:

```bash
ssh homelab mkdir -p ~/backups ~/anime_site/static/covers ~/anime_site/static/library/thumbs
scp seed.dump homelab:~/backups/
tar -C static -cf - covers | ssh homelab 'tar -C ~/anime_site/static -xf -'
```

**On the box**, restore:

```bash
cd ~/anime_site
docker compose -f docker-compose.prod.yml exec -T db \
  pg_restore -U postgres -d anime_site_db --no-owner --clean --if-exists \
  < ~/backups/seed.dump
```

Then verify, and **stop if the numbers do not match the source**:

```bash
docker compose -f docker-compose.prod.yml exec -T db psql -U postgres -d anime_site_db -tAc \
  "select (select count(*) from media), (select count(*) from users), (select count(*) from user_media_list), (select version_num from alembic_version);"
```

Confirm the covers arrived intact by comparing bytes, not `du` — block rounding
differs between filesystems and will mislead you:

```bash
find static/covers -type f -printf '%s\n' | awk '{s+=$1} END {print s}'
```

#### Step 15 — First full start, then rotate the passwords

```bash
docker compose -f docker-compose.prod.yml up -d --build db app
```

The build takes 5-15 minutes: `npm ci`, Vite, and pip wheels.

**Check that Alembic had nothing to do:**

```bash
docker compose -f docker-compose.prod.yml logs app | head -30
```

`[ALEMBIC SUCCESS] Database state is verified!` with no `Running upgrade` lines
is correct — it means the restore carried `alembic_version`. If it *runs*
migrations, the restore did not work and step 14 needs redoing.

**Now rotate both passwords.** The dump carried the development password
hashes, and the application seeds the admin account only when it is absent —
the log line `[System] Admin account verified.` is that branch. So
`ADMIN_PASSWORD` was never consulted and the box is running on development
credentials until you fix it.

Write a short script into the container and run it interactively — `getpass`
needs a terminal, and a script run from `/tmp` cannot import the application
because its own directory, not the working directory, goes on `sys.path`:

```bash
docker compose -f docker-compose.prod.yml exec -T app sh -c 'cat > /app/rotate.py' < rotate.py
docker compose -f docker-compose.prod.yml exec app python /app/rotate.py
```

The script should prompt twice per account, write nothing unless the two match,
and **verify each new password against the stored hash afterwards** — a rotation
that silently did nothing looks identical to one that worked. Delete it when
done.

#### Step 16 — The tunnel

`cloudflared` is not in the Ubuntu archive. Use Cloudflare's apt repository so
the binary gets updates the same way Docker does:

```bash
curl -fsSL https://pkg.cloudflare.com/cloudflare-main.gpg | sudo tee /usr/share/keyrings/cloudflare-main.gpg >/dev/null
echo "deb [signed-by=/usr/share/keyrings/cloudflare-main.gpg] https://pkg.cloudflare.com/cloudflared any main" | sudo tee /etc/apt/sources.list.d/cloudflared.list
sudo apt update && sudo apt install -y cloudflared
```

**Log in.** On a headless box this prints a URL rather than opening a browser —
open it on any device, and **pick the right zone** on the authorization page. A
cert scoped to the wrong zone fails later at `route dns` with a permissions
error rather than anything obvious.

```bash
cloudflared tunnel login
cloudflared tunnel create homelab
```

**The container cannot read the credentials file that command just wrote.**
Cloudflare's image runs as the `nonroot` user `65532`, and the file is mode 600
owned by you, so the service crash-loops on `permission denied` — for a file
that plainly exists and is plainly mounted. Make a second copy owned by the
container's user:

```bash
cd ~/.cloudflared
cp <uuid>.json credentials.json
sudo chown 65532:65532 credentials.json
chmod 600 credentials.json
```

Put the tunnel id and that path into `.env` as `TUNNEL_ID` and
`CLOUDFLARED_CREDENTIALS`, route the hostname, and start the service:

```bash
cloudflared tunnel route dns homelab media.cg1618.com
cd ~/anime_site
docker compose -f docker-compose.prod.yml up -d cloudflared
docker compose -f docker-compose.prod.yml logs cloudflared | grep "Registered tunnel connection"
```

Expect four registered connections across two Cloudflare edge locations. Then,
from anywhere:

```bash
curl -sS -o /dev/null -w "%{http_code}\n" https://media.cg1618.com/
```

#### Step 17 — The production Google Sheet

**Production gets its own spreadsheet and never reads the development one.**
Backup overwrites every tab, so the configuration in which production knows the
development sheet's id is the one that could destroy the development backup; it
should not exist.

1. Create a new, empty Google Sheet. Its *name* is cosmetic — the application
   opens a spreadsheet by key, never by title — but the **tab** names inside are
   matched exactly, so never rename a tab.
2. Share it as **Editor** with the `client_email` from `credentials.json`.
   Without this the API reports an error that reads like a missing sheet.
3. Put its id in `.env` as `GOOGLE_SHEET_ID`, then recreate the container so it
   is picked up — `restart` does not re-read `env_file`:

   ```bash
   docker compose -f docker-compose.prod.yml up -d app
   ```

4. Log in to the site as admin, go to `/system`, and run **Backup**. Every tab
   is created as it goes, so an empty spreadsheet is the right starting point.
5. **Open the development sheet and confirm it is untouched.** Comparing the two
   ids proves the configuration; looking at the sheet proves the outcome.

#### Step 18 — Off-box backups

Two accounts, both outside this box, before anything here runs:

1. **A Cloudflare R2 bucket**, and a **bucket-scoped Object Read & Write** API
   token for it. A read-only token is not enough — that failure has already
   been hit here.
2. **A Healthchecks.io account** with four checks, one per job, each using the
   **OnCalendar** schedule type (not Simple) with the timezone set to
   `Asia/Taipei` — see [deployment-selfhost.md](deployment-selfhost.md#backups)
   for the four schedules and grace windows. Copy each check's ping URL.

Then two files, both mode 600, neither in git:

```
~/.config/rclone/rclone.conf
```

```ini
[r2]
type = s3
provider = Cloudflare
access_key_id = <the token's access key id>
secret_access_key = <the token's secret access key>
endpoint = https://<account-id>.r2.cloudflarestorage.com
region = auto
acl = private
no_check_bucket = true
no_head = true
```

**The last two lines are required, and both fail in ways that look like a
permissions problem.** The stanza works without them right up until the first
upload.

`no_check_bucket = true` — rclone verifies the bucket exists before uploading,
which is a *bucket-level* operation. The token is scoped to objects in one
bucket, so that pre-flight check returns **403 AccessDenied** and no upload is
attempted. The token is correct; the check it cannot perform is not.

`no_head = true` — rclone HEADs the object it just wrote to confirm it, and
addresses that HEAD by the `versionId` the PUT returned. R2 does not implement
object versioning, so the request returns **501 Not Implemented** and rclone
reports the transfer as failed. The upload itself has already succeeded, and
the retry finds the object present, so the job passes with a spurious `ERROR`
line in its log and its Healthchecks ping.

The upload is still verified: `backup.sh` and `covers.sh` both run
`rclone check --checksum` after syncing, which compares checksums taken from
the bucket listing, and the nightly dump is verified by the weekly restore
drill rather than by a HEAD.

```
~/anime_site/.env.backup
```

```
R2_BUCKET=<bucket name>
HC_BACKUP_URL=<media-backup check's ping URL>
HC_SHEETS_URL=<media-sheets check's ping URL>
HC_COVERS_URL=<media-covers check's ping URL>
HC_VERIFY_URL=<media-verify check's ping URL>
```

`.env.backup` is separate from `.env` on purpose: `docker-compose.prod.yml`
gives the `app` service `env_file: .env`, so anything in `.env` reaches the
web application — including, for these four variables, write credentials for
the bucket holding the application's own backups.

Then, on the box:

```bash
sudo ./deploy/backup/install.sh
```

which installs `rclone`, installs the eight systemd units (four services and
four timers), and enables two of the four timers.

**Enabling a timer does not run its job, so nothing is backed up when this
returns.** `Persistent=true` catches up a run missed while the machine was off,
which is why these timers use it — but only for a timer that has run before. On
first activation systemd writes the stamp as of that moment and has nothing to
catch up, so the first run is the next scheduled one.

Run the three jobs by hand once, in this order. Each proves its job and arms its
Healthchecks check, which stays grey and unmonitored until its first ping:

```bash
./deploy/backup/backup.sh    # dump to R2 — first, because the drill needs one
./deploy/backup/sheets.sh    # OVERWRITES EVERY TAB of the production sheet
./deploy/backup/verify.sh    # the drill: restores that dump and asserts it
```

**Two timers are deliberately left disabled**, each until its precondition is
met:

- **`media-covers.timer`** — its first run uploads 283 MB over a metered phone
  hotspot, a cost worth spending on purpose rather than at whatever hour a
  timer happens to fire. Run the sync by hand once, then enable it.
- **`media-verify.timer`** — the weekly drill restores the newest dump in R2
  and cannot pass while the bucket holds none. Its scheduled Wednesday 04:40 run
  would then fail, making the first Healthchecks event you ever see a *failure*
  alert on the one job whose whole purpose is to be believed. Enable it once at
  least one dump exists in `db/daily/`.

```bash
./deploy/backup/covers.sh
sudo systemctl enable --now media-covers.timer

rclone lsf r2:<bucket>/db/daily        # at least one dump
sudo systemctl enable --now media-verify.timer
```

### Prove it recovers

None of this is finished until the box has been broken on purpose, while it
still holds nothing a re-restore could not replace.

**The power test.** Pull the plug, wait, plug it back in. The BIOS setting from
[step 3](#step-3--bios-settings) should bring it up with nobody present, and the
containers should follow.

**The network test.** Turn off whatever the box's network depends on, wait two
minutes, turn it back on, and **touch nothing on the box**. WiFi should
reassociate, the tunnel should re-establish and the site should serve again. If
it needs a manual reconnect, that is a real fault to fix, not a caveat to note.

**The reboot test.** `sudo reboot`, then check from elsewhere that all three
containers came back and the site answers. Measure it with `systemd-analyze`: on
this machine it is about 24 seconds, and if it is two minutes longer than that,
[step 9a](#step-9a--mark-the-unused-interface-optional) has not been done.

**The rollback rehearsal.** Run `./deploy/deploy.sh`, then follow the rollback
in [deploy/README.md](../deploy/README.md) end to end and confirm the row counts
return. **Do not skip this one.** When it was first performed here it found that
the documented procedure did not work: `git checkout` reverts the source, but
the code the container runs is baked into its image, so without `--build` the
rollback restored old data under new code — while the site stayed up and every
count came back correct. An untested rollback procedure is a guess.

### When this is done

**The machine:**

- [ ] `ssh <user>@<address>` from the dev machine logs in with no password.
- [ ] `docker run --rm hello-world` succeeds without `sudo`.
- [ ] `docker compose version` prints a version (note the space — not
      `docker-compose`).
- [ ] `lsb_release -a` shows **26.04** — not an interim release, not an ESM one.
- [ ] The arrival checks are done — the Windows ones before wiping, the SMART
      readings after — and their answers written down somewhere off this
      machine.
- [ ] `systemctl --failed` is empty, and `systemd-analyze` is well under a
      minute. Two minutes longer means
      [step 9a](#step-9a--mark-the-unused-interface-optional) was skipped.
- [ ] The monitor and keyboard are unplugged and it still works.

**The application:**

- [ ] Row counts on the box match the source, and the first start applied **no**
      migrations.
- [ ] Logging in with the *development* admin password **fails**.
- [ ] `https://<hostname>/` returns 200 from outside the network, and an
      authenticated admin route works.
- [ ] A production Backup populated the new sheet, and the development sheet is
      untouched.
- [ ] `docker compose -f docker-compose.prod.yml ps` shows three services, `db`
      healthy, and **no published ports**.
- [ ] `systemctl list-unit-files 'media-*'` shows all eight units, with
      `media-covers.timer` and `media-verify.timer` deliberately not enabled
      (yet). Use `list-unit-files`, not `list-timers --all`: the latter lists
      *loaded* units, and a timer that has never been enabled is typically not
      loaded, so a correct install would read as a missing one.
- [ ] The four Healthchecks.io checks each show a successful `/start`-then-success
      ping cycle after the first manual run of each script.

**And it has been broken on purpose:**

- [ ] Power cut, network outage and reboot each recovered with nobody present.
- [ ] A rollback has actually been rehearsed, not just written down.

**Two things are deliberately open here**, and both wait on hardware rather than
work: the DHCP reservation ([step 10](#step-10--give-it-a-fixed-address-on-the-router))
is impossible on a phone hotspot, and the cable handover
([step 11](#step-11--once-the-cable-is-in-if-setup-used-wifi)) waits on a cable.

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
