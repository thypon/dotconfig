import os

from pytest_bdd import given, scenarios, then, when

from conftest import REPO_ROOT, run_install

scenarios(os.path.join(REPO_ROOT, "tests", "features", "install.feature"))

SERVICES_DIR = os.path.join(REPO_ROOT, "macos", "services")
CTRL_SRC = os.path.join(SERVICES_DIR, "hpm-controller.sh")
PLIST_SRC = os.path.join(SERVICES_DIR, "local.dotconfig.hpm-controller.plist")


@given("a shimmed install environment")
def shimmed_install_environment(install_env):
    return install_env


@given("the controller and plist are already installed")
def already_installed(install_env):
    result = run_install()
    assert result.returncode == 0, result.stderr
    install_env["sudo_log"].unlink(missing_ok=True)
    install_env["launchctl_log"].unlink(missing_ok=True)


@given("the installed controller is stale")
def stale_controller(install_env):
    with open(install_env["ctrl_dst"], "a") as f:
        f.write("\n# stale\n")


@given("sudo_local exists with other auth config")
def other_pam_config(install_env):
    install_env["pam_local"].write_text("auth required pam_abc.so\n")


@when("install.sh runs")
def install_runs(install_env):
    install_env["result"] = run_install()


@when("install.sh runs again")
def install_runs_again(install_env):
    install_env["result2"] = run_install()


@when("install.sh runs without a tty")
def install_runs_non_tty(install_env, monkeypatch):
    monkeypatch.delenv("DOTCONFIG_ASSUME_TTY")
    install_env["result"] = run_install()


@then("sudo is never invoked")
def sudo_never(install_env):
    result = install_env["result"]
    assert not install_env["sudo_log"].exists(), (result.returncode, result.stderr)


@then("the services dir is synced")
def services_synced(install_env):
    dst = install_env["user_dst"] / "hpm-controller.sh"
    assert dst.exists()
    assert dst.read_text() == open(CTRL_SRC).read()


@then("sudo writes the pam_tid line to sudo_local")
def pam_written(install_env):
    content = install_env["pam_local"].read_text()
    assert "pam_tid.so" in content, content
    log = install_env["sudo_log"].read_text()
    assert str(install_env["pam_local"]) in log, log


@then("sudo installs the controller and plist")
def ctrl_plist_installed(install_env):
    log = install_env["sudo_log"].read_text()
    assert str(install_env["ctrl_dst"]) in log, log
    assert str(install_env["plist_dst"]) in log, log
    assert install_env["ctrl_dst"].read_text() == open(CTRL_SRC).read()
    assert install_env["plist_dst"].read_text() == open(PLIST_SRC).read()


@then("the daemon is reloaded")
def daemon_reloaded(install_env):
    log = install_env["launchctl_log"].read_text()
    assert "bootout" in log, log
    assert "bootstrap" in log, log


@then("manual sudo commands including the pam_tid line are printed")
def manual_printed(install_env):
    result = install_env["result"]
    out = result.stdout + result.stderr
    assert "pam_tid.so" in out, out
    assert "sudo install" in out, out


@then("the pam file is not rewritten")
def pam_not_rewritten(install_env):
    log = ""
    if install_env["sudo_log"].exists():
        log = install_env["sudo_log"].read_text()
    assert str(install_env["pam_local"]) not in log, log


@then("the controller was installed exactly once")
def ctrl_installed_once(install_env):
    result = install_env["result2"]
    assert result.returncode == 0, result.stderr
    lines = install_env["sudo_log"].read_text().splitlines()
    hits = [l for l in lines if str(install_env["ctrl_dst"]) in l]
    assert len(hits) == 1, lines


@then("the pam_tid line is appended")
def pam_appended(install_env):
    content = install_env["pam_local"].read_text()
    assert "pam_abc.so" in content, content
    assert "pam_tid.so" in content, content


@then("the existing pam content is preserved")
def pam_preserved(install_env):
    content = install_env["pam_local"].read_text()
    assert content.startswith("auth required pam_abc.so\n"), content
