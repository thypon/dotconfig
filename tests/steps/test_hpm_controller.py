import os
import time

import pytest
from pytest_bdd import given, parsers, scenarios, then, when

from conftest import REPO_ROOT, run_controller

scenarios(os.path.join(REPO_ROOT, "tests", "features", "hpm_controller.feature"))

NOTIFY_INTERVAL = 3600


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


@when("the controller runs")
def controller_runs(fake_env):
    fake_env["result"] = run_controller()


@when("the controller runs again")
def controller_runs_again(fake_env):
    fake_env["result2"] = run_controller()


@then(parsers.parse('pmset is called with powermode {value:d}'))
def pmset_called_with(value, fake_env):
    result = fake_env["result"]
    calls = fake_env["pmset_log"].read_text().splitlines() if fake_env["pmset_log"].exists() else []
    assert calls == [f"pmset -a powermode {value}"], (calls, result.returncode, result.stderr)


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
