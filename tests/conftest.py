import os
import subprocess
import textwrap

import pytest

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CONTROLLER = os.path.join(REPO_ROOT, "macos", "services", "hpm-controller.sh")
INSTALL = os.path.join(REPO_ROOT, "macos", "install.sh")

PMSET_SHIM = """#!/bin/sh
case "$1" in
  -a)
    # -a powermode N
    echo "pmset -a powermode $3" >> "$PMSET_LOG"
    printf '%s\\n' "$3" > "$PMSET_STATE"
    ;;
  -g)
    if [ "$2" = "batt" ]; then
      case "$FAKE_PS" in
        AC) echo "Now drawing from 'AC Power'";;
        *) echo "Now drawing from 'Battery Power'";;
      esac
    else
      echo "Currently in use:"
      if [ -f "$PMSET_STATE" ]; then
        echo " powermode $(cat "$PMSET_STATE")"
      else
        echo " powermode $FAKE_INITIAL_PM"
      fi
    fi
    ;;
  *)
    exit 1
    ;;
esac
"""

IPCONFIG_SHIM = """#!/bin/sh
if [ -n "$FAKE_WIFI_OFF" ]; then
  exit 1
fi
echo "   SSID : $FAKE_SSID"
"""

NETWORKSETUP_SHIM = """#!/bin/sh
echo "Hardware Port: Wi-Fi"
echo "Device: en0"
echo
echo "Hardware Port: Ethernet"
echo "Device: en5"
"""

OSASCRIPT_SHIM = """#!/bin/sh
echo "$@" >> "$OSASCRIPT_LOG"
"""

SUDO_SHIM = """#!/bin/sh
echo "sudo $*" >> "$SUDO_LOG"
if [ "$1" = "-v" ]; then
  exit 0
fi
exec "$@"
"""

INSTALL_SHIM = """#!/bin/sh
echo "install $*" >> "$INSTALL_LOG"
mode=""
isdir=0
while [ $# -gt 0 ]; do
  case "$1" in
    -o) shift 2 ;;
    -g) shift 2 ;;
    -m) mode="$2"; shift 2 ;;
    -d) isdir=1; shift ;;
    *) break ;;
  esac
done
if [ "$isdir" = "1" ]; then
  for d in "$@"; do
    mkdir -p "$d"
  done
else
  src="$1"
  dst="$2"
  cp "$src" "$dst"
  if [ -n "$mode" ]; then
    chmod "$mode" "$dst"
  fi
fi
"""

LAUNCHCTL_SHIM = """#!/bin/sh
echo "launchctl $*" >> "$LAUNCHCTL_LOG"
exit 0
"""


def write_shim(bin_dir, name, body):
    path = bin_dir / name
    path.write_text(body)
    path.chmod(0o755)
    return path


@pytest.fixture
def fake_env(tmp_path, monkeypatch):
    """PATH-shimmed environment for running the controller."""
    bin_dir = tmp_path / "bin"
    bin_dir.mkdir()
    state_dir = tmp_path / "state"
    state_dir.mkdir()
    log_dir = tmp_path / "logs"
    log_dir.mkdir()
    write_shim(bin_dir, "pmset", PMSET_SHIM)
    write_shim(bin_dir, "ipconfig", IPCONFIG_SHIM)
    write_shim(bin_dir, "networksetup", NETWORKSETUP_SHIM)
    write_shim(bin_dir, "osascript", OSASCRIPT_SHIM)

    env = {
        "PATH": str(bin_dir) + ":/usr/bin:/bin:/usr/sbin:/sbin",
        "PMSET_STATE": str(tmp_path / "pmset-state"),
        "PMSET_LOG": str(log_dir / "pmset.log"),
        "OSASCRIPT_LOG": str(log_dir / "osascript.log"),
        "FAKE_PS": "AC",
        "FAKE_SSID": "TEST_WORK_SSID",
        "FAKE_INITIAL_PM": "0",
        "DOTCONFIG_HPM_MAPPING_PINNED": "1",
        "DOTCONFIG_HPM_STATE_DIR": str(state_dir),
        "HOME": str(tmp_path),
    }
    for key, value in env.items():
        monkeypatch.setenv(key, value)
    return {
        "bin_dir": bin_dir,
        "state_dir": state_dir,
        "log_dir": log_dir,
        "pmset_log": log_dir / "pmset.log",
        "osascript_log": log_dir / "osascript.log",
        "pmset_state": tmp_path / "pmset-state",
    }


def run_controller():
    return subprocess.run(
        ["/bin/sh", CONTROLLER],
        capture_output=True,
        text=True,
        timeout=30,
    )


@pytest.fixture
def install_env(tmp_path, monkeypatch):
    """PATH-shimmed environment for running macos/install.sh."""
    bin_dir = tmp_path / "bin"
    bin_dir.mkdir()
    write_shim(bin_dir, "sudo", SUDO_SHIM)
    write_shim(bin_dir, "install", INSTALL_SHIM)
    write_shim(bin_dir, "launchctl", LAUNCHCTL_SHIM)

    log_dir = tmp_path / "logs"
    log_dir.mkdir()
    pam_dir = tmp_path / "pam.d"
    pam_dir.mkdir()
    lib_dst = tmp_path / "lib" / "dotconfig"
    launchd_dir = tmp_path / "launchd"
    launchd_dir.mkdir()
    user_dst = tmp_path / "user-services" / "dotconfig"
    user_dst = tmp_path / "user-services" / "dotconfig"

    env = {
        "PATH": str(bin_dir) + ":/usr/bin:/bin:/usr/sbin:/sbin",
        "HOME": str(tmp_path),
        "SUDO_LOG": str(log_dir / "sudo.log"),
        "INSTALL_LOG": str(log_dir / "install.log"),
        "LAUNCHCTL_LOG": str(log_dir / "launchctl.log"),
        "DOTCONFIG_ASSUME_TTY": "1",
        "DOTCONFIG_PAM_LOCAL": str(pam_dir / "sudo_local"),
        "DOTCONFIG_LIB_DST": str(lib_dst),
        "DOTCONFIG_LAUNCHD_PLIST_DST": str(launchd_dir / "local.dotconfig.hpm-controller.plist"),
        "DOTCONFIG_USER_SERVICES_DST": str(user_dst),
    }
    for key, value in env.items():
        monkeypatch.setenv(key, value)
    return {
        "pam_local": pam_dir / "sudo_local",
        "lib_dst": lib_dst,
        "ctrl_dst": lib_dst / "hpm-controller.sh",
        "plist_dst": launchd_dir / "local.dotconfig.hpm-controller.plist",
        "user_dst": user_dst,
        "sudo_log": log_dir / "sudo.log",
        "launchctl_log": log_dir / "launchctl.log",
    }


def run_install():
    return subprocess.run(
        ["/bin/sh", INSTALL],
        capture_output=True,
        text=True,
        timeout=30,
    )
