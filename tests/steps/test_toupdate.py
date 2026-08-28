import os
import subprocess

from pytest_bdd import given, parsers, scenarios, then, when

scenarios("../features/bin/toupdate.feature")

CURL_SHIM = '''
echo "curl $*" >> "$CURL_LOG"
cat "$FEED_FILE"
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


def _setup_feed(ctx, pkgs):
    state = ctx.env.state_dir
    feed = state / "updates.txt"
    feed.write_text("".join(f"{p} 2.0.0_1\n" for p in pkgs))
    ctx.env.shim("curl", CURL_SHIM)
    ctx.env.set_env(
        FEED_FILE=str(feed),
        CURL_LOG=str(state / "curl.log"),
    )


def _setup_checkout(ctx, message):
    repo = ctx.env.home / "void-packages"
    repo.mkdir(parents=True, exist_ok=True)
    _git("init", "-b", "main", str(repo), cwd=ctx.env.home)
    (repo / "srcpkgs").mkdir()
    (repo / "srcpkgs" / "placeholder").write_text("")
    _git("-C", str(repo), "add", "-A", cwd=repo)
    _git("-C", str(repo), "commit", "-m", message, cwd=repo)


@given("no void-packages git checkout at $VOID_PACKAGES")
def given_no_checkout(ctx):
    assert not (ctx.env.home / "void-packages" / ".git").exists()


@given(parsers.re(r"the updates feed lists (?P<pkgs>pkg-\w+(?: and pkg-\w+)*)"))
def given_feed_lists(ctx, pkgs):
    _setup_feed(ctx, pkgs.split(" and "))


@given("a void-packages checkout whose last 100 commits update pkg-a")
def given_checkout_updated_pkg_a(ctx):
    _setup_checkout(ctx, "pkg-a: update to 2.0.0.")


@given('a void-packages checkout with no "update to" commits')
def given_checkout_no_update_commits(ctx):
    _setup_checkout(ctx, "initial import")


@when("toupdate runs")
def when_toupdate_runs(ctx):
    ctx.proc = ctx.env.run("toupdate")


@then("the output lists pkg-a and pkg-b")
def then_lists_both(ctx):
    assert "pkg-a" in ctx.proc.stdout
    assert "pkg-b" in ctx.proc.stdout


@then("the output lists pkg-b only")
def then_lists_b_only(ctx):
    assert "pkg-b" in ctx.proc.stdout
    assert "pkg-a" not in ctx.proc.stdout


@then("the output lists pkg-a")
def then_lists_a(ctx):
    assert "pkg-a" in ctx.proc.stdout