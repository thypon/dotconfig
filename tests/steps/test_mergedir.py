import os
import subprocess

from pytest_bdd import given, parsers, scenarios, then, when

scenarios("../features/bin/mergedir.feature")

GIT_SHIM = '''
echo "git $*" >> "$GIT_LOG"
if [ "$1" = "fetch" ]; then
  url=$(/usr/bin/git remote get-url "$2" 2>/dev/null || true)
  case "$url" in
    *example.com*) exit 0 ;;
  esac
fi
exec /usr/bin/git "$@"
'''

GIT_ENV = {
    "GIT_AUTHOR_NAME": "Test",
    "GIT_AUTHOR_EMAIL": "t@e",
    "GIT_COMMITTER_NAME": "Test",
    "GIT_COMMITTER_EMAIL": "t@e",
}


def _git(*args, cwd):
    subprocess.run(
        ["/usr/bin/git", *args],
        cwd=str(cwd),
        check=True,
        capture_output=True,
        env={**os.environ, **GIT_ENV},
    )


def _git_out(*args, cwd):
    return subprocess.run(
        ["/usr/bin/git", *args],
        cwd=str(cwd),
        check=True,
        capture_output=True,
        text=True,
        env={**os.environ, **GIT_ENV},
    ).stdout


def _init_repo(ctx):
    state = ctx.env.state_dir
    ctx.env.shim("git", GIT_SHIM)
    ctx.env.set_env(
        GIT_LOG=str(state / "git.log"),
        GIT_AUTHOR_NAME="Test",
        GIT_AUTHOR_EMAIL="t@e",
        GIT_COMMITTER_NAME="Test",
        GIT_COMMITTER_EMAIL="t@e",
        GIT_EDITOR="true",
    )
    repo = ctx.env.cwd_dir
    _git("init", "-b", "main", str(repo), cwd=ctx.env.cwd_dir.parent)
    (repo / "base.txt").write_text("base\n")
    _git("-C", str(repo), "add", "base.txt", cwd=repo)
    _git("-C", str(repo), "commit", "-m", "base", cwd=repo)
    ctx.head_before = _git_out(
        "-C", str(repo), "rev-parse", "HEAD", cwd=repo
    ).strip()


def _make_remote(ctx, filename, content):
    fixtures = ctx.env.home / "fixtures"
    fixtures.mkdir(parents=True, exist_ok=True)
    remote = fixtures / "remote-lib"
    _git("init", "-b", "main", str(remote), cwd=fixtures)
    (remote / filename).write_text(content)
    _git("-C", str(remote), "add", filename, cwd=remote)
    _git("-C", str(remote), "commit", "-m", "remote init", cwd=remote)
    ctx.remote = str(remote)


@given("a git repo with no remotes")
def given_repo_no_remotes(ctx):
    _init_repo(ctx)
    assert (
        _git_out("-C", str(ctx.env.cwd_dir), "remote", cwd=ctx.env.cwd_dir).strip()
        == ""
    )


@given("a git repo and remote repo with file README.md")
def given_repo_and_remote_with_readme(ctx):
    _init_repo(ctx)
    _make_remote(ctx, "README.md", "remote readme\n")


@given("a git repo and an unrelated remote repo")
def given_repo_and_unrelated_remote(ctx):
    _init_repo(ctx)
    _make_remote(ctx, "remote.txt", "unrelated\n")


@when(parsers.parse('mergedir runs with "{repo}", "{subdir}" and "{branch}"'))
def when_mergedir_url(ctx, repo, subdir, branch):
    ctx.proc = ctx.env.run("mergedir", repo, subdir, branch)


@when(parsers.parse('mergedir runs with the remote, "{subdir}" and "{branch}"'))
def when_mergedir_remote(ctx, subdir, branch):
    ctx.proc = ctx.env.run("mergedir", ctx.remote, subdir, branch)


@then(parsers.parse('a remote named "{name}" points at {url}'))
def then_remote_points_at(ctx, name, url):
    out = _git_out(
        "-C", str(ctx.env.cwd_dir), "remote", "get-url", name, cwd=ctx.env.cwd_dir
    ).strip()
    assert out == url


@then("vendor/lib/README.md is staged in the index")
def then_readme_staged(ctx):
    out = _git_out("-C", str(ctx.env.cwd_dir), "ls-files", cwd=ctx.env.cwd_dir)
    assert "vendor/lib/README.md" in out.split()


@then("the merge uses -s ours --no-commit --allow-unrelated-histories")
def then_merge_strategy_args(ctx):
    log = (ctx.env.state_dir / "git.log").read_text().splitlines()
    expected = (
        "git merge -s ours --no-commit --allow-unrelated-histories vendor-lib/main"
    )
    assert expected in [line.strip() for line in log]


@then("a commit is created")
def then_commit_created(ctx):
    head = _git_out(
        "-C", str(ctx.env.cwd_dir), "rev-parse", "HEAD", cwd=ctx.env.cwd_dir
    ).strip()
    assert head != ctx.head_before