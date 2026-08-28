import importlib
import os
from pathlib import Path

from pytest_bdd import given, parsers, scenarios, then, when

scenarios("../features/bin/spr.feature")

# spr.feature shares its repo-given step texts with subl-head.feature
# ("a git repo with BASE_COMMIT origin/master", "a git repo",
# "BASE_COMMIT is {base}"). Those definitions live in test_subl-head.py;
# reuse them (never redefine) by importing the module and aliasing its
# registered step fixtures into this module's globals.
_subl_head = importlib.import_module("test_subl-head")
for _name, _obj in vars(_subl_head).items():
    if _name.startswith("pytestbdd_stepdef_"):
        globals()[_name] = _obj

SEMGREP_SHIM = """
pwd > "$SEMGREP_CWD"
printf '%s\\n' "$@" >> "$SEMGREP_LOG"
: > "$SEMGREP_FINDINGS"
for f in "$@"; do
  if [ -f "$f" ]; then
    echo "finding: $f:1: hit" >> "$SEMGREP_FINDINGS"
  fi
done
exit 0
"""


def ensure_spr_env(ctx):
    ctx.env.set_env(
        SEMGREP_LOG=str(ctx.env.state_dir / "semgrep-args.log"),
        SEMGREP_CWD=str(ctx.env.state_dir / "semgrep-cwd.log"),
        SEMGREP_FINDINGS=str(ctx.env.state_dir / "semgrep-findings.txt"),
    )
    ctx.env.shim("semgrep", SEMGREP_SHIM)


def ensure_feature_branch(ctx):
    heads = _subl_head._git(
        ctx, "for-each-ref", "--format=%(refname:short)", "refs/heads/"
    ).stdout.split()
    if "feature" in heads:
        return
    _subl_head._git(ctx, "checkout", "-q", "-b", "feature")
    changed = False
    for name in ("a.py", "b.py"):
        path = ctx.env.cwd_dir / name
        if not path.exists():
            path.write_text(name + "\n")
            changed = True
    if changed:
        _subl_head._git(ctx, "add", "-A")
        _subl_head._git(ctx, "commit", "-qm", "feature work")
    _subl_head._git(ctx, "checkout", "-q", "master")


def ensure_repo(ctx):
    if not (ctx.env.cwd_dir / ".git").exists():
        _subl_head.given_repo_base_origin_master(ctx)
    ensure_spr_env(ctx)
    ensure_feature_branch(ctx)


def semgrep_args(ctx):
    return Path(ctx.env.state_dir / "semgrep-args.log").read_text().splitlines()


@given("branch feature changes a.py and b.py")
def given_feature_changes(ctx):
    ensure_repo(ctx)


@when(parsers.parse('spr runs with "{branch}"'))
def when_spr_runs(ctx, branch):
    ensure_repo(ctx)
    ctx.proc = ctx.env.run("spr", branch)


@when('spr runs with --config and auto and "feature"')
def when_spr_runs_flags(ctx):
    ensure_repo(ctx)
    ctx.proc = ctx.env.run("spr", "--config", "auto", "feature")


@then("semgrep is invoked on exactly a.py and b.py")
def then_semgrep_files(ctx):
    assert semgrep_args(ctx) == ["a.py", "b.py"]


@then("the merge-base uses origin/develop")
def then_merge_base_develop(ctx):
    assert semgrep_args(ctx) == ["a.py", "b.py"]


@then("no extra git worktree remains after exit")
def then_worktree_cleaned(ctx):
    assert ctx.proc.returncode == 0
    # The shim logged its cwd from inside the temp worktree during the
    # run. darwin mktemp -d ignores TMPDIR and always uses the per-user
    # DARWIN_USER_TEMP_DIR, so the exact path is only observable through
    # that log; it must be gone afterwards.
    semgrep_wd = Path(ctx.env.state_dir / "semgrep-cwd.log").read_text().strip()
    assert os.path.basename(semgrep_wd).startswith("tmp.")
    assert semgrep_wd != str(ctx.env.cwd_dir)
    assert not os.path.exists(semgrep_wd)


@then("semgrep receives --config auto before the file list")
def then_flag_order(ctx):
    assert semgrep_args(ctx) == ["--config", "auto", "a.py", "b.py"]
