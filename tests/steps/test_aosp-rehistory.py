import importlib
import os
import subprocess

import test_gcleanup  # noqa: F401  (needed so its shared steps exist on full runs)
from pytest_bdd import given, parsers, scenarios, then, when

scenarios("../features/bin/aosp-rehistory.feature")

# "a git repo with branch A and branch B" lives in test_aosp-reapply.py;
# re-export the step definition instead of redefining it (pytest-bdd step
# definitions are global and duplicates break collection).
_reapply = importlib.import_module("test_aosp-reapply")
globals()["pytestbdd_stepdef_given_a git repo with branch A and branch B"] = getattr(
    _reapply, "pytestbdd_stepdef_given_a git repo with branch A and branch B"
)

GIT_ENV = {
    "PATH": "/usr/bin:/bin:/usr/sbin:/sbin",
    "GIT_AUTHOR_NAME": "Test",
    "GIT_AUTHOR_EMAIL": "t@e",
    "GIT_COMMITTER_NAME": "Test",
    "GIT_COMMITTER_EMAIL": "t@e",
    "GIT_CONFIG_NOSYSTEM": "1",
    "GIT_CONFIG_GLOBAL": "/dev/null",
}


def _git(ctx, *args):
    return subprocess.run(
        ["/usr/bin/git", *args],
        cwd=str(ctx.repo),
        capture_output=True,
        text=True,
        check=True,
        env={**GIT_ENV, "HOME": str(ctx.env.home)},
    )


def _write(ctx, content):
    (ctx.repo / "f.txt").write_text(content)


def _commit(ctx, msg):
    _git(ctx, "add", "-A")
    _git(ctx, "commit", "-q", "-m", msg)


def _minimum_line(ctx):
    lines = [l for l in ctx.proc.stdout.splitlines() if l.startswith("Minimum commit: ")]
    assert len(lines) == 1, lines
    return lines[0]


@given("exactly one commit in branch B that nearly matches branch A")
def given_one_near_match(ctx):
    # Base repo: branch A sits on the root commit, so that root commit of
    # branch B is the unique minimum-diff commit (diff 0).
    ctx.expected_sha = _git(ctx, "rev-parse", "master").stdout.strip()
    ctx.expected_diff = "0"


@given("commits after the minimum drifting far away")
def given_drift(ctx):
    # Rebuild B: root -> drift(61) -> min(10) -> tip(101) versus branch A.
    # With -t 20 the moving average (61 > 10 * 1.2) aborts the walk at the
    # drift commit, so the root commit (diff 0) is never reached; a full
    # walk would report the root instead.
    _git(ctx, "checkout", "-q", "-B", "B", "master")
    _write(ctx, "\n".join(f"z{i}" for i in range(1, 61)) + "\n")
    _commit(ctx, "Drift far")
    _write(ctx, "base\n" + "".join(f"q{i}\n" for i in range(1, 11)))
    _commit(ctx, "Near match")
    _write(ctx, "\n".join(f"w{i}" for i in range(1, 101)) + "\n")
    _commit(ctx, "Far tip")
    ctx.expected_sha = _git(ctx, "rev-parse", "HEAD~1").stdout.strip()
    ctx.expected_diff = "10"


def _run_rehistory(ctx, *extra):
    ctx.proc = ctx.env.run(
        "aosp-rehistory", "-a", "A", "-b", "B", *extra,
        extra_env={"PWD": str(ctx.env.cwd_dir)},
    )


@when("aosp-rehistory runs with -a A and -b B")
def when_runs(ctx):
    _run_rehistory(ctx)


@when("aosp-rehistory runs with -a A and -b B and -t 20")
def when_runs_t20(ctx):
    _run_rehistory(ctx, "-t", "20")


@when("aosp-rehistory runs with -a A and -b B and -c out.csv")
def when_runs_csv(ctx):
    _run_rehistory(ctx, "-c", "out.csv")


@then(parsers.parse('the output names that commit sha as "{marker}"'))
def then_names_sha(ctx, marker):
    assert ctx.proc.returncode == 0
    assert _minimum_line(ctx) == f"{marker}: {ctx.expected_sha} with {ctx.expected_diff} diff"


@then("the search stops before walking the whole history")
def then_stops_early(ctx):
    assert ctx.proc.returncode == 0
    # The root commit of B (diff 0 against A) sits deeper in the history;
    # reporting the intermediate minimum proves the walk was cut short.
    assert _minimum_line(ctx) == f"Minimum commit: {ctx.expected_sha} with {ctx.expected_diff} diff"


@then("out.csv contains workdir, branches, winning sha and diff size")
def then_csv(ctx):
    assert ctx.proc.returncode == 0
    csv = ctx.env.cwd_dir / "out.csv"
    lines = csv.read_text().splitlines()
    assert len(lines) == 1, lines
    fields = lines[0].split(",")
    assert len(fields) == 5, lines[0]
    assert fields[0] == str(ctx.env.cwd_dir)
    assert fields[1] == "A"
    assert fields[2] == "B"
    root_sha = _git(ctx, "rev-parse", "master").stdout.strip()
    assert fields[3] == root_sha
    assert fields[4] == "0"
