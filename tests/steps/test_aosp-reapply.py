import glob
import os
import re
import subprocess

import test_gcleanup as _gcleanup
from pytest_bdd import given, parsers, scenarios, then, when

scenarios("../features/bin/aosp-reapply.feature")

# "the current directory is not a git repository" lives in test_gcleanup.py;
# re-export the step definition instead of redefining it (pytest-bdd step
# definitions are global and duplicates break collection).
globals()["pytestbdd_stepdef_given_the current directory is not a git repository"] = getattr(
    _gcleanup, "pytestbdd_stepdef_given_the current directory is not a git repository"
)

TESTS_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
# GEM_HOME resolved from the Bundler install (tests/Gemfile, path .gems).
_gem_dirs = glob.glob(os.path.join(TESTS_DIR, ".gems", "ruby", "*", "gems"))
if not _gem_dirs:
    raise RuntimeError(
        "bundle install not run: cd tests && bundle install (see tests/Gemfile)"
    )
GEM_HOME = os.path.dirname(_gem_dirs[0])

GIT_ENV = {
    "PATH": "/usr/bin:/bin:/usr/sbin:/sbin",
    "GIT_AUTHOR_NAME": "Test",
    "GIT_AUTHOR_EMAIL": "t@e",
    "GIT_COMMITTER_NAME": "Test",
    "GIT_COMMITTER_EMAIL": "t@e",
    "GIT_CONFIG_NOSYSTEM": "1",
    "GIT_CONFIG_GLOBAL": "/dev/null",
}

RESULT_RE = re.compile(r"^.+ , .+ , (true|false) , \d+ , \d+ , (Applied|Missing)$")


def _git(ctx, *args, cwd=None):
    return subprocess.run(
        ["/usr/bin/git", *args],
        cwd=str(cwd or ctx.repo),
        capture_output=True,
        text=True,
        check=True,
        env={**GIT_ENV, "HOME": str(ctx.env.home)},
    )


def _write(ctx, content):
    (ctx.repo / "f.txt").write_text(content)


def _commit(ctx, msg, empty=False):
    if not empty:
        _git(ctx, "add", "-A")
    args = ["commit", "-q", "-m", msg]
    if empty:
        args.append("--allow-empty")
    _git(ctx, *args)


def _branch_from_master(ctx, name):
    _git(ctx, "checkout", "-q", "-B", name, "master")


def _build_applied(ctx, bug):
    """B's patch (create g.txt) already exists in A below an empty tip."""
    _branch_from_master(ctx, "A")
    (ctx.repo / "g.txt").write_text("one\ntwo\n")
    _commit(ctx, "Bring fix")
    _commit(ctx, "A tip", empty=True)
    _branch_from_master(ctx, "B")
    (ctx.repo / "g.txt").write_text("one\ntwo\n")
    _commit(ctx, f"Fix bug\n\nBug: {bug}\n")


def _build_conflict(ctx, bug):
    """B's commit and A's tip rewrite f.txt in conflicting ways."""
    _branch_from_master(ctx, "A")
    _write(ctx, "a-side\n")
    _commit(ctx, "A side")
    _branch_from_master(ctx, "B")
    _write(ctx, "b-side\n")
    _commit(ctx, f"B side\n\nBug: {bug}\n")


def _build_untagged(ctx):
    _branch_from_master(ctx, "B")
    _write(ctx, "x\n")
    _commit(ctx, "No bug tag here")


def _build_csv(ctx, bug):
    _branch_from_master(ctx, "B")
    _write(ctx, "base\nplus\n")
    _commit(ctx, f"Extra work\n\nBug: {bug}\n")


@given("a git repo with branch A and branch B")
def given_repo(ctx):
    ctx.env.set_env(GEM_HOME=GEM_HOME)
    ctx.repo = ctx.env.cwd_dir
    _git(ctx, "init", "-q", "-b", "master")
    _write(ctx, "base\n")
    _commit(ctx, "Root")
    _branch_from_master(ctx, "A")
    _commit(ctx, "A tip", empty=True)
    _branch_from_master(ctx, "B")
    _write(ctx, "base\nthree\n")
    _commit(ctx, "Add three")


@given(parsers.parse('a commit on branch B carrying "Bug: {bug}" that is already in branch A'))
def given_already_in_a(ctx, bug):
    ctx.bug = bug
    _build_applied(ctx, bug)


@given(parsers.parse('a commit on branch B carrying "Bug: {bug}" that conflicts with branch A'))
def given_conflicts_with_a(ctx, bug):
    ctx.bug = bug
    _build_conflict(ctx, bug)


@given("a commit on branch B without a Bug tag")
def given_untagged(ctx):
    _build_untagged(ctx)


@given("a Bug-tagged commit on branch B")
def given_bug_tagged(ctx):
    ctx.bug = "789"
    _build_csv(ctx, "789")


@given("a git repo in a scratch directory with branch A and branch B")
def given_scratch_repo(ctx):
    ctx.env.set_env(GEM_HOME=GEM_HOME)
    ctx.bug = "999"
    ctx.scratch_repo = ctx.env.state_dir / "scratch-repo"
    ctx.scratch_repo.mkdir(parents=True)
    ctx.repo = ctx.scratch_repo
    _git(ctx, "init", "-q", "-b", "master")
    _write(ctx, "base\n")
    _commit(ctx, "Root")
    _build_applied(ctx, "999")


def _run_reapply(ctx, *extra):
    ctx.proc = ctx.env.run(
        "aosp-reapply", "-a", "A", "-b", "B", *extra,
        extra_env={"PWD": str(ctx.env.cwd_dir)},
    )


@when("aosp-reapply runs with -a A and -b B")
def when_runs(ctx):
    _run_reapply(ctx)


@when("aosp-reapply runs with -a A and -b B and -c results.csv")
def when_runs_csv(ctx):
    _run_reapply(ctx, "-c", "results.csv")


@when("aosp-reapply runs with -w the scratch repo and -a A and -b B")
def when_runs_scratch(ctx):
    _run_reapply(ctx, "-w", str(ctx.scratch_repo))


def _result_lines(ctx):
    return [l for l in ctx.proc.stdout.splitlines() if RESULT_RE.match(l)]


def _single_result_line(ctx, status):
    assert ctx.proc.returncode == 0
    lines = _result_lines(ctx)
    assert len(lines) == 1, lines
    assert lines[0].endswith(f" , {status}")
    assert f" , {ctx.bug} , " in lines[0]


@then("the commit is reported with status Applied")
def then_reported_applied(ctx):
    _single_result_line(ctx, "Applied")


@then("the commit is reported with status Missing")
def then_reported_missing(ctx):
    _single_result_line(ctx, "Missing")


@then("no output line is produced for that commit")
def then_no_line(ctx):
    assert ctx.proc.returncode == 0
    assert not _result_lines(ctx)


@then("results.csv contains one line for the commit")
def then_csv(ctx):
    assert ctx.proc.returncode == 0
    assert not _result_lines(ctx)
    csv = ctx.env.cwd_dir / "results.csv"
    lines = csv.read_text().splitlines()
    assert len(lines) == 1, lines
    assert RESULT_RE.match(lines[0])
    assert f" , {ctx.bug} , " in lines[0]


@then("the command succeeds using the scratch repo")
def then_scratch(ctx):
    _single_result_line(ctx, "Applied")
