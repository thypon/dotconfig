import os
import time

import pytest
from pytest_bdd import given, parsers, scenarios, then, when

from conftest import REPO_ROOT, run_controller, write_shim

scenarios(os.path.join(REPO_ROOT, "tests", "features", "hpm_controller.feature"))

NOTIFY_INTERVAL = 3600

PROVIDER_SHIM = """#!/bin/sh
echo "$*" >> "$PROVIDER_LOG"
exit "${FAKE_PROVIDER_EXIT:-0}"
"""

SUDO_RUN_SHIM = """#!/bin/sh
echo "sudo $*" >> "$SUDO_LOG"
if [ "$1" = "-u" ]; then
  shift 2
elif [ "$1" = "-v" ]; then
  shift
fi
exec "$@"
"""


@given("the power mode value mapping is pinned")
def mapping_pinned():
    controller = open(os.path.join(REPO_ROOT, "macos", "services", "hpm-controller.sh")).read()
    assert "2 (High Power Mode)" in controller
    assert "1 (Low Power Mode)" in controller


@given(parsers.parse('a fake secrets file with hpm_wifi_ssid "{ssid}"'))
def fake_secrets(ssid, tmp_path, monkeypatch):
    secrets = tmp_path / "secrets.yml"
    secrets.write_text(f"hpm_wifi_ssid: {ssid}\n")
    monkeypatch.setenv("DOTCONFIG_SECRETS", str(secrets))


@given('a fake secrets file with hpm_wifi_ssid ""')
def fake_secrets_empty(tmp_path, monkeypatch):
    secrets = tmp_path / "secrets.yml"
    secrets.write_text("hpm_wifi_ssid: \"\"\n")
    monkeypatch.setenv("DOTCONFIG_SECRETS", str(secrets))


@given("no secrets file exists")
def no_secrets(tmp_path, monkeypatch):
    secrets = tmp_path / "secrets.yml"
    monkeypatch.setenv("DOTCONFIG_SECRETS", str(secrets))
    assert not secrets.exists()


@given(parsers.parse('the power source is {source}'))
def power_source(source, fake_env, monkeypatch):
    monkeypatch.setenv("FAKE_PS", source)


@given(parsers.parse('the WiFi SSID is "{ssid}"'))
def wifi_ssid(ssid, fake_env, monkeypatch):
    monkeypatch.setenv("FAKE_SSID", ssid)
    monkeypatch.delenv("FAKE_WIFI_OFF", raising=False)


@given("the WiFi is off")
def wifi_off(monkeypatch):
    monkeypatch.setenv("FAKE_WIFI_OFF", "1")


@given(parsers.parse('the current powermode is {value:d}'))
def current_powermode(value, fake_env, monkeypatch):
    monkeypatch.setenv("FAKE_INITIAL_PM", str(value))


@given(parsers.parse('a notification was shown {minutes:d} minutes ago'))
def recent_notification(minutes, fake_env):
    stamp = fake_env["state_dir"] / "last-notify"
    stamp.write_text("")
    old = time.time() - minutes * 60
    os.utime(stamp, (old, old))


@given("pmset reports an unsupported powermode")
def unsupported_powermode(fake_env, monkeypatch):
    monkeypatch.setenv("FAKE_INITIAL_PM", "-1")


@given(parsers.parse('the current disablesleep is {value:d}'))
def current_disablesleep(value, fake_env, monkeypatch):
    monkeypatch.setenv("FAKE_INITIAL_DS", str(value))


@when("the controller runs")
def controller_runs(fake_env):
    fake_env["result"] = run_controller()


@when("the controller runs again")
def controller_runs_again(fake_env):
    fake_env["result2"] = run_controller()


@given("a fake console user with a home directory")
def fake_console_user(fake_env, monkeypatch):
    console_home = fake_env["bin_dir"].parent / "console-home"
    console_home.mkdir()
    fake_env["console_home"] = console_home
    fake_env["provider_log"] = fake_env["log_dir"] / "provider.log"
    fake_env["sudo_log"] = fake_env["log_dir"] / "sudo.log"
    monkeypatch.setenv("DOTCONFIG_HPM_CONSOLE_USER", "fakeuser")
    monkeypatch.setenv("DOTCONFIG_HPM_CONSOLE_HOME", str(console_home))
    monkeypatch.setenv("DOTCONFIG_PROVIDER_LOG", str(fake_env["provider_log"]))
    monkeypatch.setenv("PROVIDER_LOG", str(fake_env["provider_log"]))
    monkeypatch.setenv("SUDO_LOG", str(fake_env["sudo_log"]))
    write_shim(fake_env["bin_dir"], "sudo", SUDO_RUN_SHIM)


@given("a provider binary is installed for the console user")
def provider_binary_installed(fake_env):
    provider_dir = fake_env["console_home"] / ".local" / "bin"
    provider_dir.mkdir(parents=True, exist_ok=True)
    path = provider_dir / "provider"
    path.write_text(PROVIDER_SHIM)
    path.chmod(0o755)


@given(parsers.parse("the provider binary exits with {code:d}"))
def provider_binary_exit_code(code, monkeypatch):
    monkeypatch.setenv("FAKE_PROVIDER_EXIT", str(code))


@given(parsers.parse('the last chosen provider prefix is "{prefix}"'))
def last_provider_prefix(prefix, fake_env):
    config_dir = fake_env["console_home"] / ".config"
    config_dir.mkdir(parents=True, exist_ok=True)
    (config_dir / ".provider-last").write_text(prefix)


@given(parsers.parse('the controller last saw network state "{state}"'))
def previous_network_state(state, fake_env):
    (fake_env["state_dir"] / "last-provider-ssid").write_text(state)


@then(parsers.parse('the provider is re-resolved with prefix "{prefix}"'))
def provider_reresolved(prefix, fake_env):
    log = fake_env["provider_log"]
    assert log.exists(), fake_env["result"].stderr
    assert log.read_text().splitlines() == [prefix], log.read_text()


@then("the provider is not re-resolved")
def provider_not_reresolved(fake_env):
    log = fake_env.get("provider_log")
    assert log is None or not log.exists() or log.read_text().strip() == ""


@then(parsers.parse('the network state is recorded as "{state}"'))
def network_state_recorded(state, fake_env):
    path = fake_env["state_dir"] / "last-provider-ssid"
    assert path.exists()
    assert path.read_text().strip() == state


@then("no network state is recorded")
def no_network_state(fake_env):
    assert not (fake_env["state_dir"] / "last-provider-ssid").exists()


@then("a provider resolution failure is logged")
def provider_failure_logged(fake_env):
    assert "FAILED" in fake_env["result"].stderr, fake_env["result"].stderr


@then(parsers.parse('pmset is called with powermode {value:d}'))
def pmset_called_with(value, fake_env):
    result = fake_env["result"]
    calls = fake_env["pmset_log"].read_text().splitlines() if fake_env["pmset_log"].exists() else []
    assert calls == [f"pmset -a powermode {value}"], (calls, result.returncode, result.stderr)


@then(parsers.parse('pmset is called with disablesleep {value:d}'))
def pmset_called_with_disablesleep(value, fake_env):
    result = fake_env["result"]
    calls = fake_env["pmset_log"].read_text().splitlines() if fake_env["pmset_log"].exists() else []
    assert calls == [f"pmset -a disablesleep {value}"], (calls, result.returncode, result.stderr)


@then("pmset is not called at all")
def pmset_not_called(fake_env):
    result = fake_env["result"]
    assert not fake_env["pmset_log"].exists(), (result.returncode, result.stderr)


@then(parsers.parse('pmset set powermode was called exactly once'))
def pmset_called_once(fake_env):
    calls = fake_env["pmset_log"].read_text().splitlines()
    assert len(calls) == 1, calls


@then("a notification is shown")
def notification_shown(fake_env):
    assert fake_env["osascript_log"].exists()
    assert "notification" in fake_env["osascript_log"].read_text()


@then("no notification is shown")
def no_notification(fake_env):
    assert not fake_env["osascript_log"].exists()


@then("the notification timestamp is recorded")
def timestamp_recorded(fake_env):
    assert (fake_env["state_dir"] / "last-notify").exists()


@then("the controller exits 0")
def controller_exit_zero(fake_env):
    assert fake_env["result"].returncode == 0, fake_env["result"].stderr
