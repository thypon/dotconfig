import os
import re
import shutil
import subprocess
from types import SimpleNamespace

import pytest
from pytest_bdd import given, scenarios, then, when

from conftest import REPO_ROOT, write_shim

TIGRC = os.path.join(REPO_ROOT, "common", ".tigrc")

scenarios(os.path.join(REPO_ROOT, "tests", "features", "tigrc.feature"))

DIFT_SHIM = '#!/bin/sh\necho "$@" >> "$DIFT_LOG"\n'


def git(repo, *args):
    env = {k: v for k, v in os.environ.items() if not k.startswith("GIT_")}
    env.update(
        {
            "GIT_CONFIG_GLOBAL": "/dev/null",
            "GIT_CONFIG_SYSTEM": "/dev/null",
            "GIT_AUTHOR_NAME": "Tig Test",
            "GIT_AUTHOR_EMAIL": "tig-test@example.com",
            "GIT_COMMITTER_NAME": "Tig Test",
            "GIT_COMMITTER_EMAIL": "tig-test@example.com",
        }
    )
    return subprocess.run(
        ["git", *args],
        cwd=str(repo),
        capture_output=True,
        text=True,
        env=env,
        timeout=60,
    )


@pytest.fixture
def tig_env(tmp_path):
    home = tmp_path / "home"
    home.mkdir()
    bin_dir = tmp_path / "shims"
    bin_dir.mkdir()
    repo_dir = tmp_path / "repo"
    repo_dir.mkdir()
    return SimpleNamespace(
        home=home,
        bin_dir=bin_dir,
        repo_dir=repo_dir,
        dift_log=tmp_path / "difft.log",
        changed_file="hello.py",
        head=None,
        binding_proc=None,
        tig_runs={},
    )


def binding_env(tig_env):
    return {
        "PATH": str(tig_env.bin_dir) + os.pathsep + os.environ.get("PATH", "/usr/bin:/bin"),
        "HOME": str(tig_env.home),
        "DIFT_LOG": str(tig_env.dift_log),
        "GIT_CONFIG_GLOBAL": "/dev/null",
        "GIT_CONFIG_SYSTEM": "/dev/null",
    }


def read_binding(view):
    with open(TIGRC) as f:
        for line in f:
            m = re.match(r"^bind\s+(\S+)\s+D\s+!(.+?)\s*$", line)
            if m and m.group(1) == view:
                return m.group(2)
    raise AssertionError(f"no 'bind {view} D !...' found in {TIGRC}")


def run_binding(tig_env, view, subs):
    cmd = read_binding(view)
    for var, value in subs.items():
        cmd = cmd.replace(var, value)
    tig_env.binding_proc = subprocess.run(
        ["/bin/sh", "-c", cmd],
        cwd=str(tig_env.repo_dir),
        capture_output=True,
        text=True,
        env=binding_env(tig_env),
        timeout=60,
    )


@given("a scratch repo with a commit that changes a file")
def scratch_repo(tig_env):
    repo = tig_env.repo_dir
    path = repo / tig_env.changed_file
    path.write_text("def foo():\n    return 1\n")
    r = git(repo, "init")
    assert r.returncode == 0, r.stderr
    r = git(repo, "add", ".")
    assert r.returncode == 0, r.stderr
    r = git(repo, "commit", "-m", "initial")
    assert r.returncode == 0, r.stderr
    # leave the file modified (unstaged) for the status-view scenario
    path.write_text("def foo():\n    return 2\n")
    r = git(repo, "rev-parse", "HEAD")
    assert r.returncode == 0, r.stderr
    tig_env.head = r.stdout.strip()


@given("a shimmed difft on PATH")
def shimmed_dift(tig_env):
    write_shim(tig_env.bin_dir, "difft", DIFT_SHIM)


@given("tig is installed")
def tig_installed():
    if shutil.which("tig") is None:
        pytest.skip("tig is not installed")


@when("the D binding of the main view runs on HEAD")
def run_main_binding(tig_env):
    run_binding(tig_env, "main", {"%(commit)": tig_env.head})


@when("the D binding of the status view runs on the file")
def run_status_binding(tig_env):
    run_binding(tig_env, "status", {"%(file)": tig_env.changed_file})


@when("tig starts with the tigrc loaded")
def tig_loads_tigrc(tig_env):
    def run_tig(tigrc_path):
        env = dict(os.environ)
        env.update(
            {
                "TIGRC_USER": str(tigrc_path),
                "HOME": str(tig_env.home),
                "GIT_CONFIG_GLOBAL": "/dev/null",
                "GIT_CONFIG_SYSTEM": "/dev/null",
            }
        )
        return subprocess.run(
            ["tig"],
            stdin=subprocess.DEVNULL,
            capture_output=True,
            text=True,
            env=env,
            timeout=30,
            cwd=str(tig_env.repo_dir),
        )

    # Control: a broken tigrc must produce errors, proving tig actually
    # loads TIGRC_USER during this invocation (keeps the check honest).
    bad = tig_env.home / "bad.tigrc"
    bad.write_text("set this-option-does-not-exist = junk\n")
    tig_env.tig_runs["control"] = run_tig(bad)
    tig_env.tig_runs["tigrc"] = run_tig(TIGRC)


@then("difft is invoked by git with the changed file")
def difft_invoked(tig_env):
    proc = tig_env.binding_proc
    assert proc is not None
    assert proc.returncode == 0, (proc.returncode, proc.stdout, proc.stderr)
    assert tig_env.dift_log.exists(), proc.stderr
    invocations = [
        line.split()
        for line in tig_env.dift_log.read_text().splitlines()
        if line.strip()
    ]
    assert invocations, "difft was never invoked"
    args = invocations[0]
    # git external diff contract: path old-file old-sha old-mode new-file new-sha new-mode
    assert len(args) == 7, args
    assert tig_env.changed_file in args


@then("the tigrc contains no diff-options setting")
def no_diff_options_setting():
    with open(TIGRC) as f:
        content = f.read()
    assert not re.search(r"^set\s+diff-options\b", content, re.M), content


@then("no tigrc errors are reported")
def no_tigrc_errors(tig_env):
    control = tig_env.tig_runs["control"]
    control_out = control.stderr + control.stdout
    assert "rror" in control_out, (
        "control check failed: tig did not report errors for a broken tigrc; "
        f"stderr={control.stderr!r} stdout={control.stdout!r}"
    )
    good = tig_env.tig_runs["tigrc"]
    good_out = good.stderr + good.stdout
    assert "rror" not in good_out and "arning" not in good_out, good_out
