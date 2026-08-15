#!/usr/bin/env bash
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
UNIT_NAME="hamza-cloudflare-oauth-bridge.service"
SOURCE_UNIT="$DIR/systemd/$UNIT_NAME"
USER_HOME="${HOME:-$(getent passwd "$(id -u)" | cut -d: -f6)}"
[ -n "$USER_HOME" ] || { echo "unable to determine user home directory" >&2; exit 1; }
TARGET_DIR="$USER_HOME/.config/systemd/user"
TARGET_UNIT="$TARGET_DIR/$UNIT_NAME"

[ -f "$SOURCE_UNIT" ] || { echo "missing unit: $SOURCE_UNIT" >&2; exit 1; }
command -v systemctl >/dev/null 2>&1 || { echo "systemctl is required" >&2; exit 1; }

mkdir -p "$TARGET_DIR"
install -m 0644 "$SOURCE_UNIT" "$TARGET_UNIT"

export XDG_RUNTIME_DIR="${XDG_RUNTIME_DIR:-/run/user/$(id -u)}"
export DBUS_SESSION_BUS_ADDRESS="${DBUS_SESSION_BUS_ADDRESS:-unix:path=$XDG_RUNTIME_DIR/bus}"

if [ ! -S "$XDG_RUNTIME_DIR/bus" ]; then
  echo "systemd user bus is unavailable at $XDG_RUNTIME_DIR/bus" >&2
  exit 1
fi

systemctl --user daemon-reload
systemctl --user enable hamza-cloudflare-oauth-bridge.service

echo "enabled $UNIT_NAME for WSL user-session startup"
echo "  start now: systemctl --user start $UNIT_NAME"
echo "  status:    systemctl --user status $UNIT_NAME"
echo "  disable:   systemctl --user disable $UNIT_NAME"
