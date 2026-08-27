#!/bin/sh
# Install everything this repo manages on macOS:
#   1. rsync macos/services -> ~/Library/Services/dotconfig/ (unprivileged)
#   2. Touch ID for sudo via /etc/pam.d/sudo_local (pam_tid.so; survives
#      OS updates, included from /etc/pam.d/sudo)
#   3. hpm controller + LaunchDaemon plist into /Library, then reload
# Privileged steps run only when the live files differ from the repo.
# In non-tty contexts, prints the manual commands and skips the privileged part.

set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
REPO_ROOT=$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)
SRC="$REPO_ROOT/macos/services"
PAM_LOCAL="${DOTCONFIG_PAM_LOCAL:-/etc/pam.d/sudo_local}"
LIB_DST="${DOTCONFIG_LIB_DST:-/Library/Application Support/dotconfig}"
PLIST_NAME="local.dotconfig.hpm-controller.plist"
PLIST_DST="${DOTCONFIG_LAUNCHD_PLIST_DST:-/Library/LaunchDaemons/$PLIST_NAME}"
USER_DST="${DOTCONFIG_USER_SERVICES_DST:-$HOME/Library/Services/dotconfig}"
CTRL_NAME="hpm-controller.sh"
CTRL_DST="$LIB_DST/$CTRL_NAME"
LABEL="local.dotconfig.hpm-controller"
PAM_LINE="auth       sufficient     pam_tid.so"

manual_cmd() {
    cat <<EOF
Run manually to finish installation (requires sudo):

  printf '%s\n' "$PAM_LINE" | sudo tee -a "$PAM_LOCAL" >/dev/null
  sudo install -d -o root -g wheel -m 755 "$LIB_DST"
  sudo install -o root -g wheel -m 755 "$SRC/$CTRL_NAME" "$CTRL_DST"
  sudo install -o root -g wheel -m 644 "$SRC/$PLIST_NAME" "$PLIST_DST"
  sudo launchctl bootout system/$LABEL 2>/dev/null || true
  sudo launchctl bootstrap system "$PLIST_DST"
EOF
}

# 1. User-level rsync (idempotent, prunes removed files)
mkdir -p "$USER_DST"
rsync -a --delete "$SRC/" "$USER_DST/"

# 2. Figure out what privileged work is needed
touchid_ok=0
if [ -f "$PAM_LOCAL" ] && grep -q "pam_tid\.so" "$PAM_LOCAL"; then
    touchid_ok=1
fi

needs_install=0
if [ ! -f "$CTRL_DST" ] || ! cmp -s "$SRC/$CTRL_NAME" "$CTRL_DST"; then
    needs_install=1
fi
if [ ! -f "$PLIST_DST" ] || ! cmp -s "$SRC/$PLIST_NAME" "$PLIST_DST"; then
    needs_install=1
fi

if [ "$touchid_ok" -eq 1 ] && [ "$needs_install" -eq 0 ]; then
    exit 0
fi

if [ ! -t 0 ] && [ -z "${DOTCONFIG_ASSUME_TTY:-}" ]; then
    echo "dotconfig: installation needs sudo but stdin is not a tty." >&2
    manual_cmd >&2
    exit 0
fi

echo "dotconfig: installing (sudo required)..."
sudo -v

# 3. Touch ID for sudo (merge: keep any existing sudo_local content)
if [ "$touchid_ok" -eq 0 ]; then
    tmp=$(mktemp)
    {
        if [ -f "$PAM_LOCAL" ]; then
            cat "$PAM_LOCAL"
        fi
        printf '%s\n' "$PAM_LINE"
    } > "$tmp"
    sudo install -o root -g wheel -m 644 "$tmp" "$PAM_LOCAL"
    rm -f "$tmp"
    echo "dotconfig: touch id enabled for sudo ($PAM_LOCAL)."
fi

# 4. Controller + daemon plist
sudo install -d -o root -g wheel -m 755 "$LIB_DST"
sudo install -o root -g wheel -m 755 "$SRC/$CTRL_NAME" "$CTRL_DST"
sudo install -o root -g wheel -m 644 "$SRC/$PLIST_NAME" "$PLIST_DST"

# 5. Reload daemon with new bits
sudo launchctl bootout system/$LABEL 2>/dev/null || true
sudo launchctl bootstrap system "$PLIST_DST"
echo "dotconfig: installed and daemon loaded."
