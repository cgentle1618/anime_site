#!/usr/bin/env bash
# Run this ONCE, on the box, with sudo. It is the only part of the backup
# system that needs root. Read it before you run it.
#
#   sudo ./deploy/backup/install.sh
#
# Before running, both of these must already exist (neither needs root):
#   ~/.config/rclone/rclone.conf   the R2 remote, named r2, mode 600
#   ~/anime_site/.env.backup       HC_*_URL and R2_BUCKET, mode 600

set -euo pipefail

[ "$(id -u)" -eq 0 ] || { echo "Run with sudo." >&2; exit 1; }

REAL_USER="${SUDO_USER:?run via sudo, not as root directly}"
REPO="/home/${REAL_USER}/anime_site"
UNITS="${REPO}/deploy/backup/units"

for f in "/home/${REAL_USER}/.config/rclone/rclone.conf" "${REPO}/.env.backup"; do
    [ -f "${f}" ] || { echo "Missing ${f}. See deploy/README.md." >&2; exit 1; }
done

echo "==> Installing rclone and shellcheck"
apt-get update -qq
apt-get install -y rclone shellcheck

echo "==> Installing units"
install -m 644 "${UNITS}"/media-*.service "${UNITS}"/media-*.timer /etc/systemd/system/
sed -i "s/^User=.*/User=${REAL_USER}/" /etc/systemd/system/media-*.service
sed -i "s#/home/cgentle1618/#/home/${REAL_USER}/#" /etc/systemd/system/media-*.service
systemctl daemon-reload

echo "==> Enabling timers"
# Enable whatever units/ contains, minus an explicit defer list. Iterating
# rather than naming each timer means a later job (a deploy-drift check, say)
# is added by dropping two unit files in units/ - no edit here.
#
# media-covers is on the defer list deliberately. Its first run uploads 283 MB
# over a metered phone hotspot, and that is a cost to spend on purpose, not one
# a timer picks at 04:20. Run covers.sh by hand once, then:
#     sudo systemctl enable --now media-covers.timer
DEFER=(media-covers.timer)

for path in "${UNITS}"/*.timer; do
    timer="$(basename "${path}")"
    skip=0
    for d in "${DEFER[@]}"; do
        [ "${timer}" = "${d}" ] && skip=1
    done
    if [ "${skip}" -eq 1 ]; then
        echo "    deferring ${timer} (enable it by hand - see the note above)"
        continue
    fi
    systemctl enable --now "${timer}"
done

systemctl list-timers --all --no-pager | grep media- || true
echo
echo "==> Done. media-covers.timer is NOT enabled - see the note above."
