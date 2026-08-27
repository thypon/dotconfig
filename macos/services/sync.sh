#!/bin/sh
# Sync macos/services from this repo into the live locations:
#   1. rsync repo -> ~/Library/Services/dotconfig/ (unprivileged)
#   2. Install controller + LaunchDaemon plist into /Library (sudo when needed)
#   3. Reload the daemon
# Auto-prompts for sudo only when installed files differ from the repo.
# In non-tty contexts, prints the manual command and skips the privileged part.

set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
REPO_ROOT=$(CDPATH= cd -- "$SCRIPT_DIR/../.." && pwd)
SRC="$REPO_ROOT/macos/services"
USER_DST="$HOME/Library/Services/dotconfig"
LIB_DST="/Library/Application Support/dotconfig"
PLIST_NAME="local.dotconfig.hpm-controller.plist"
PLIST_SRC="$SRC/$PLIST_NAME"
PLIST_DST="/Library/LaunchDaemons/$PLIST_NAME"
CTRL_NAME="hpm-controller.sh"
CTRL_DST="$LIB_DST/$CTRL_NAME"
LABEL="local.dotconfig.hpm-controller"

manual_cmd() {
    cat <<EOF
Run manually to install (requires sudo):

  sudo install -d -o root -g wheel -m 755 "$LIB_DST"
  sudo install -o root -g wheel -m 755 "$SRC/$CTRL_NAME" "$CTRL_DST"
  sudo install -o root -g wheel -m 644 "$PLIST_SRC" "$PLIST_DST"
  sudo launchctl bootout system/$LABEL 2>/dev/null || true
  sudo launchctl bootstrap system "$PLIST_DST"
EOF
}

# 1. User-level rsync (idempotent, prunes removed files)
mkdir -p "$USER_DST"
rsync -a --delete "$SRC/" "$USER_DST/"

# 2. Privileged install when source and destination differ
needs_install=0
if [ ! -f "$CTRL_DST" ] || ! cmp -s "$SRC/$CTRL_NAME" "$CTRL_DST"; then
    needs_install=1
fi
if [ ! -f "$PLIST_DST" ] || ! cmp -s "$PLIST_SRC" "$PLIST_DST"; then
    needs_install=1
fi
if [ "$needs_install" -eq 0 ]; then
    exit 0
fi

if [ ! -t 0 ]; then
    echo "dotconfig: hpm controller needs (re)installing but stdin is not a tty." >&2
    manual_cmd >&2
    exit 0
fi

echo "dotconfig: installing hpm controller (sudo required)..."
sudo -v
sudo install -d -o root -g wheel -m 755 "$LIB_DST"
sudo install -o root -g wheel -m 755 "$SRC/$CTRL_NAME" "$CTRL_DST"
sudo install -o root -g wheel -m 644 "$PLIST_SRC" "$PLIST_DST"

# 3. Reload daemon with new bits
sudo launchctl bootout system/$LABEL 2>/dev/null || true
sudo launchctl bootstrap system "$PLIST_DST"
echo "dotconfig: hpm controller installed and daemon loaded."
