import os
import subprocess
import textwrap

import pytest

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CONTROLLER = os.path.join(REPO_ROOT, "macos", "services", "hpm-controller.sh")

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
