#!/bin/sh
# HPM controller: keep power mode aligned with power source + work WiFi SSID.
# Matrix:
#   AC     + work SSID   -> 2 (High Power Mode)
#   AC     + other/off   -> 0 (Automatic)
#   Battery + work SSID  -> 0 (Automatic)
#   Battery + other/off  -> 1 (Low Power Mode)
# Sleep policy (independent of SSID/secrets):
#   AC      -> disablesleep 1 (never suspend; stays on with lid closed)
#   Battery -> disablesleep 0 (normal sleep)
# Work SSID comes from ~/.config/secrets.yml key hpm_wifi_ssid.
# If the key is missing/empty: sleep policy still applies, powermode untouched,
# notify once per hour.
# Env overrides (tests only): DOTCONFIG_SECRETS, DOTCONFIG_HPM_STATE_DIR,
# DOTCONFIG_HPM_CONSOLE_USER, DOTCONFIG_HPM_CONSOLE_HOME, DOTCONFIG_PROVIDER_LOG.
# Runs as a LaunchDaemon (root) every 10s; logs to /var/log/dotconfig-hpm.log.

set -u

STATE_DIR="${DOTCONFIG_HPM_STATE_DIR:-/var/db/dotconfig-hpm}"
console_user="${DOTCONFIG_HPM_CONSOLE_USER-$(stat -f %Su /dev/console 2>/dev/null || true)}"
console_home="${DOTCONFIG_HPM_CONSOLE_HOME-}"
if [ -z "$console_home" ] && [ -n "$console_user" ] && [ "$console_user" != "root" ] && [ "$console_user" != "loginwindow" ]; then
    console_home=$(dscl . -read "/Users/$console_user" NFSHomeDirectory 2>/dev/null | sed -n 's/^NFSHomeDirectory:[[:space:]]*//p' | head -n 1)
fi
SECRETS="${DOTCONFIG_SECRETS:-${console_home:-${HOME:-/var/root}}/.config/secrets.yml}"
NOTIFY_INTERVAL=3600
LOG_TAG="dotconfig-hpm"

log() { echo "$(date '+%Y-%m-%d %H:%M:%S') [$LOG_TAG] $*" >&2; }

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

# --- sleep policy: never suspend on AC, normal sleep on battery ---------------
# Note: pmset -g reports the disablesleep value as 'SleepDisabled' in the
# "System-wide power settings" section (older builds print 'disablesleep').
ds_current=$(pmset -g 2>/dev/null \
    | sed -n -E 's/^[[:space:]]*(SleepDisabled|disablesleep)[[:space:]]+//p' | head -n 1)
case "$ds_current" in
    0|1)
        if [ "$source" = "AC" ]; then ds_desired=1; else ds_desired=0; fi
        if [ "$ds_current" != "$ds_desired" ]; then
            log "power source=$source disablesleep current=$ds_current desired=$ds_desired"
            if pmset -a disablesleep "$ds_desired"; then
                log "set disablesleep $ds_desired"
            else
                log "failed to set disablesleep $ds_desired"
            fi
        fi
        ;;
    *)
        log "disablesleep unsupported or unreadable (current='$ds_current'), skipping sleep policy"
        ;;
esac

# --- secrets -----------------------------------------------------------------
ssid=""
if [ -f "$SECRETS" ]; then
    ssid=$(grep -E '^hpm_wifi_ssid:' "$SECRETS" 2>/dev/null \
        | sed -E 's/^hpm_wifi_ssid:[[:space:]]*//; s/[[:space:]]*#.*$//; s/^"(.*)"$/\1/' | head -n 1)
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

# --- current powermode -------------------------------------------------------
current=$(pmset -g 2>/dev/null | sed -n 's/^ *powermode[[:space:]]*//p' | head -n 1)
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
        | sed -n 's/^ *SSID : //p' | head -n 1 | sed 's/_5G$//')
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

# --- provider re-resolution on work-WiFi transitions --------------------------
# Re-resolves `provider ${last}` (last manually chosen prefix) on network
# transitions. The provider script itself decides: on work Wi-Fi it routes
# flash roles to the local ds4 server; off work Wi-Fi it restores the
# provider's own remote models.
last_ssid_state="$STATE_DIR/last-provider-ssid"
provider_log="${DOTCONFIG_PROVIDER_LOG:-/var/log/dotconfig-provider.log}"
want_net=off
if [ "$ssid" = "$current_ssid" ] && [ -n "$current_ssid" ]; then
    want_net=work
fi
prev_net=""
[ -f "$last_ssid_state" ] && prev_net=$(cat "$last_ssid_state" 2>/dev/null)
if [ "$prev_net" != "$want_net" ] && [ -n "$console_user" ]; then
    echo "$want_net" > "$last_ssid_state" 2>/dev/null
    provider_bin="$console_home/.local/bin/provider"
    prefix_file="$console_home/.config/.provider-last"
    if [ -x "$provider_bin" ] && [ -f "$prefix_file" ]; then
        last_prefix=$(cat "$prefix_file" 2>/dev/null)
        if [ -n "$last_prefix" ]; then
            log "network transition (off->work=$([ "$want_net" = work ] && echo yes || echo no)): resolving provider $last_prefix"
            sudo -u "#$(stat -f %u /dev/console 2>/dev/null)" env HOME="$console_home" \
                "$provider_bin" "$last_prefix" >> "$provider_log" 2>&1 \
                && log "provider $last_prefix resolved" || log "provider $last_prefix FAILED"
        fi
    fi
fi
exit 0
