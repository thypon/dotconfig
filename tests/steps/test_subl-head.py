import os
import subprocess

from pytest_bdd import given, parsers, scenarios, then, when

scenarios("../features/bin/subl-head.feature")

GIT_ENV = {
    "GIT_AUTHOR_NAME": "Test",
    "GIT_AUTHOR_EMAIL": "t@e",
    "GIT_COMMITTER_NAME": "Test",
    "GIT_COMMITTER_EMAIL": "t@e",
}

SUBL_SHIM = '''
printf '%s\\n' "$@" >> "$SUBL_LOG"
'''


def _git(ctx, *args):
    proc = subprocess.run(
        ["/usr/bin/git", *args],
        cwd=str(ctx.env.cwd_dir),
        capture_output=True,
        text=True,
        env={
            "PATH": "/usr/bin:/bin:/usr/sbin:/sbin",
            "HOME": str(ctx.env.home),
            **GIT_ENV,
        },
    )
    if proc.returncode != 0:
        raise AssertionError(f"git {args} failed: {proc.stderr}{proc.stdout}")
    return proc


def _commit_all(ctx, message):
    _git(ctx, "add", "-A")
    _git(ctx, "commit", "-m", message)


def _setup_subl(ctx):
    ctx.env.shim("subl", SUBL_SHIM)
    ctx.subl_log = ctx.env.state_dir / "subl.log"
    ctx.env.set_env(SUBL_LOG=str(ctx.subl_log))


def _write_changed(ctx, names):
    for name in names:
        (ctx.env.cwd_dir / name).write_text(name + "\n")


@given("a git repo with BASE_COMMIT origin/master")
def given_repo_base_origin_master(ctx):
    _git(ctx, "init", "-b", "master")
    _write_changed(ctx, ["base.txt"])
    _commit_all(ctx, "base")
    base = _git(ctx, "rev-parse", "HEAD").stdout.strip()
    _git(ctx, "update-ref", "refs/remotes/origin/master", base)
    ctx.env.set_env(BASE_COMMIT="origin/master")
    _setup_subl(ctx)


@given("HEAD changes a.py and b.py")
def given_head_changes(ctx):
    _write_changed(ctx, ["a.py", "b.py"])
    _commit_all(ctx, "head work")


@given("a git repo")
def given_repo_with_develop_divergence(ctx):
    _git(ctx, "init", "-b", "master")
    _write_changed(ctx, ["base.txt"])
    _commit_all(ctx, "base")
    master = _git(ctx, "rev-parse", "HEAD").stdout.strip()
    _git(ctx, "update-ref", "refs/remotes/origin/master", master)
    (ctx.env.cwd_dir / "dev.txt").write_text("dev\n")
    _commit_all(ctx, "develop work")
    develop = _git(ctx, "rev-parse", "HEAD").stdout.strip()
    _git(ctx, "update-ref", "refs/remotes/origin/develop", develop)
    _write_changed(ctx, ["a.py", "b.py"])
    _commit_all(ctx, "head work")
    _setup_subl(ctx)


@given(parsers.parse("BASE_COMMIT is {base}"))
def given_base_commit(ctx, base):
    ctx.env.set_env(BASE_COMMIT=base)


@when("subl-head runs")
def when_subl_head_runs(ctx):
    ctx.proc = ctx.env.run("subl-head")
    ctx.subl_args = (
        ctx.subl_log.read_text().splitlines() if ctx.subl_log.exists() else []
    )


@then(parsers.parse('subl is invoked with "." and {first} and {second}'))
def then_subl_invoked(ctx, first, second):
    assert ctx.subl_args == [".", first, second]


@then("the diff base is origin/develop")
def then_diff_base_develop(ctx):
    assert ctx.subl_args == [".", "a.py", "b.py"]
    assert "dev.txt" not in ctx.subl_args
    assert "base.txt" not in ctx.subl_args
