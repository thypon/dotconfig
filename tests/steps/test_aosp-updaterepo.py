import os
import subprocess

from pytest_bdd import given, parsers, scenarios, then, when

scenarios("../features/bin/aosp-updaterepo.feature")

SUBPATH = "frameworks/base"
REMOTE_URL = "https://android.googlesource.com/platform/" + SUBPATH

GIT_FETCH_SHIM = '''
if [ "$1" = "fetch" ]; then
  echo "git $*" >> "$GIT_LOG"
  exit 0
fi
exec /usr/bin/git "$@"
'''

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


def _init_repo(ctx, base):
    base.mkdir(parents=True)
    ctx.repo = base
    _git(ctx, "init", "-q")


def _swap_cwd(ctx, base):
    cwd = ctx.env.cwd_dir
    if cwd.is_symlink():
        cwd.unlink()
    else:
        cwd.rmdir()
    os.symlink(str(base), str(cwd))


def _install_git_shim(ctx):
    ctx.env.shim("git", GIT_FETCH_SHIM)
    ctx.env.set_env(GIT_LOG=str(ctx.env.state_dir / "git.log"))


def _android_remote(ctx):
    return _git(ctx, "remote", "get-url", "android").stdout.strip()


@given(parsers.parse("the working directory is $PROJECT/{sub}"))
def given_cwd_in_default_project(ctx, sub):
    _init_repo(ctx, ctx.env.home / "Workspace" / "android" / sub)
    _swap_cwd(ctx, ctx.repo)
    _install_git_shim(ctx)


@given("no android remote exists")
def given_no_remote(ctx):
    assert _git(ctx, "remote").stdout.strip() == ""


@given("the android remote already exists with a stale URL")
def given_stale_remote(ctx):
    _init_repo(ctx, ctx.env.home / "Workspace" / "android" / SUBPATH)
    _git(ctx, "remote", "add", "android", "https://old.example.invalid/platform/" + SUBPATH)
    _swap_cwd(ctx, ctx.repo)
    _install_git_shim(ctx)


@given("the working directory is not under the default project")
def given_cwd_outside_default(ctx):
    assert not str(ctx.env.cwd_dir).startswith(str(ctx.env.home))


@when("aosp-updaterepo runs with no argument")
@when("aosp-updaterepo runs")
def when_runs(ctx):
    ctx.proc = ctx.env.run("aosp-updaterepo", extra_env={"PWD": str(ctx.repo)})


@when("aosp-updaterepo runs with a temporary project root as argument")
def when_runs_with_root(ctx):
    root = ctx.env.state_dir / "androidroot"
    _init_repo(ctx, root / SUBPATH)
    _swap_cwd(ctx, ctx.repo)
    _install_git_shim(ctx)
    ctx.proc = ctx.env.run("aosp-updaterepo", str(root) + "/", extra_env={"PWD": str(ctx.repo)})


@then(parsers.parse("the android remote is set to {url}"))
def then_remote_is(ctx, url):
    assert _android_remote(ctx) == url


@then("the android remote URL is updated and git fetch android runs")
def then_url_updated_and_fetched(ctx):
    assert _android_remote(ctx) == REMOTE_URL
    log = ctx.env.state_dir / "git.log"
    assert log.exists(), "git fetch android was not logged"
    assert "git fetch android" in log.read_text()


@then("the remote URL is derived relative to that project root")
def then_url_relative_to_root(ctx):
    assert _android_remote(ctx) == REMOTE_URL
