#!/bin/sh
# HPM controller: keep power mode aligned with power source + work WiFi SSID.
# Matrix:
#   AC     + work SSID   -> 2 (High Power Mode)
#   AC     + other/off   -> 0 (Automatic)
#   Battery + work SSID  -> 0 (Automatic)
#   Battery + other/off  -> 1 (Low Power Mode)
# Work SSID comes from ~/.config/secrets.yml key hpm_wifi_ssid.
# If the key is missing/empty: leave powermode untouched, notify once per hour.
# Env overrides (tests only): DOTCONFIG_SECRETS, DOTCONFIG_HPM_STATE_DIR.
# Runs as a LaunchDaemon (root) every 10s; logs to /var/log/dotconfig-hpm.log.

set -u

STATE_DIR="${DOTCONFIG_HPM_STATE_DIR:-/var/db/dotconfig-hpm}"
SECRETS="${DOTCONFIG_SECRETS:-$HOME/.config/secrets.yml}"
NOTIFY_INTERVAL=3600
LOG_TAG="dotconfig-hpm"

log() { echo "$(date '+%Y-%m-%d %H:%M:%S') [$LOG_TAG] $*" >&2; }

# --- secrets -----------------------------------------------------------------
ssid=""
if [ -f "$SECRETS" ]; then
    ssid=$(grep -E '^hpm_wifi_ssid:' "$SECRETS" 2>/dev/null \
        | sed -E 's/^hpm_wifi_ssid:[[:space:]]*//; s/^"(.*)"$/\1/' | head -n 1)
fi
if [ -z "$ssid" ]; then
    log "no hpm_wifi_ssid in $SECRETS, leaving powermode untouched"

    mkdir -p "$STATE_DIR" 2>/dev/null
    stamp="$STATE_DIR/last-notify"
    now=$(date +%s)
    notify_due=1
    if [ -f "$stamp" ]; then
        if last=$(stat -f %m "$stamp" 2>/dev/null || stat -c %Y "$stamp" 2>/dev/null); then
            if [ $((now - last)) -lt "$NOTIFY_INTERVAL" ]; then
                notify_due=0
            fi
        fi
    fi
    if [ "$notify_due" -eq 1 ]; then
        msg="dotconfig HPM: add hpm_wifi_ssid to secrets.yml to enable power mode automation"
        if [ "$(id -u)" = "0" ] && console_uid=$(stat -f %u /dev/console 2>/dev/null); then
            sudo -u "#$console_uid" osascript -e "display notification \"$msg\" with title \"dotconfig\"" 2>/dev/null || true
        else
            osascript -e "display notification \"$msg\" with title \"dotconfig\"" 2>/dev/null || true
        fi
        touch "$stamp"
        log "notified user about missing hpm_wifi_ssid"
    fi
    exit 0
fi

# --- power source ------------------------------------------------------------
ps_info=$(pmset -g batt 2>/dev/null || true)
case "$ps_info" in
    *"Now drawing from 'AC Power'"*) source="AC" ;;
    *"Now drawing from 'Battery Power'"*) source="Battery" ;;
    *)
        log "cannot determine power source, leaving powermode untouched"
        exit 0
        ;;
esac

# --- current powermode -------------------------------------------------------
current=$(pmset -g 2>/dev/null | sed -n 's/^ *powermode //p' | head -n 1)
case "$current" in
    0|1|2) ;;
    *)
        log "powermode unsupported or unreadable (current='$current'), exiting"
        exit 0
        ;;
esac

# --- current WiFi SSID -------------------------------------------------------
wifi_dev=$(networksetup -listallhardwareports 2>/dev/null \
    | awk '/^Hardware Port: Wi-Fi/{getline; print $2; exit}')
current_ssid=""
if [ -n "$wifi_dev" ]; then
    current_ssid=$(ipconfig getsummary "$wifi_dev" 2>/dev/null \
        | sed -n 's/^ *SSID : //p' | head -n 1)
fi

# --- desired powermode -------------------------------------------------------
if [ "$source" = "AC" ] && [ "$ssid" = "$current_ssid" ]; then
    desired=2
elif [ "$source" = "AC" ]; then
    desired=0
elif [ "$ssid" = "$current_ssid" ]; then
    desired=0
else
    desired=1
fi

# --- apply -------------------------------------------------------------------
if [ "$current" != "$desired" ]; then
    log "power source=$source ssid=${current_ssid:-<none>} current=$current desired=$desired"
    if pmset -a powermode "$desired"; then
        log "set powermode $desired"
    else
        log "failed to set powermode $desired"
        exit 1
    fi
fi
exit 0
