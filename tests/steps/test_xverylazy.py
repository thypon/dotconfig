"""Steps for ossnix/.local/bin/xverylazy.

The script validates the cwd is a void-packages git checkout, lists
updates via toupdate, feeds the package names to xlazy. The sandbox cwd
itself is turned into the (fake) void-packages repo; toupdate and xlazy
are PATH shims so their invocations can be asserted. No feature edits
were needed: the feed step text collides with test_toupdate's regex
step, but pytest-bdd 8.x resolves step defs as module-scoped fixtures,
so this module's exact-string definition is independent.
"""

import subprocess

from pytest_bdd import given, scenarios, then, when

scenarios("../features/bin/xverylazy.feature")

TOUPDATE_SHIM = '''
echo "toupdate $*" >> "$TOUPDATE_LOG"
cat "$TOUPDATE_OUT" 2>/dev/null
'''

XLAZY_SHIM = '''
echo "xlazy $*" >> "$XLAZY_LOG"
'''


def _git(*args, cwd):
    subprocess.run(
        ["/usr/bin/git", "-c", "user.name=t", "-c", "user.email=t@e", *args],
        cwd=str(cwd),
        check=True,
        capture_output=True,
    )


def _make_repo(ctx):
    repo = ctx.env.cwd_dir
    if (repo / "xbps-src").exists():
        return
    _git("init", "-q", "-b", "main", str(repo), cwd=repo.parent)
    (repo / "xbps-src").write_text("#!/bin/sh\nexit 0\n")
    (repo / "xbps-src").chmod(0o755)
    pkgdir = repo / "srcpkgs" / "pkg-a"
    pkgdir.mkdir(parents=True)
    (pkgdir / "template").write_text("pkgname=pkg-a\nversion=1.0\nrevision=1\n")
    _git("-C", str(repo), "add", "-A", cwd=repo)
    _git("-C", str(repo), "commit", "-q", "-m", "initial import", cwd=repo)


def _setup_shims(ctx, feed_lines):
    out = ctx.env.state_dir / "toupdate.out"
    out.write_text("".join(line + "\n" for line in feed_lines))
    ctx.env.shim("toupdate", TOUPDATE_SHIM)
    ctx.env.shim("xlazy", XLAZY_SHIM)
    state = ctx.env.state_dir
    ctx.env.set_env(
        TOUPDATE_OUT=str(out),
        TOUPDATE_LOG=str(state / "toupdate.log"),
        XLAZY_LOG=str(state / "xlazy.log"),
    )


@given("a void-packages repo")
def given_repo(ctx):
    _make_repo(ctx)


@given("the updates feed lists pkg-a and pkg-b")
def given_feed_lists(ctx):
    _make_repo(ctx)
    _setup_shims(ctx, ["pkg-a 1.0_1", "pkg-b 2.0_1"])


@given("the updates feed is empty")
def given_feed_empty(ctx):
    _make_repo(ctx)
    _setup_shims(ctx, [])


@given("the current directory is not a void-packages checkout")
def given_not_void_repo(ctx):
    _git("init", "-q", "-b", "main", str(ctx.env.cwd_dir), cwd=ctx.env.cwd_dir.parent)


@when("xverylazy runs")
def when_xverylazy(ctx):
    ctx.proc = ctx.env.run("xverylazy")


@then("xlazy is called with pkg-a and pkg-b")
def then_xlazy_called(ctx):
    log = (ctx.env.state_dir / "xlazy.log").read_text()
    assert log == "xlazy pkg-a pkg-b\n"


@then("the script exits 0 saying there is nothing to update")
def then_nothing_to_update(ctx):
    assert ctx.proc.returncode == 0
    assert "no packages to update" in ctx.proc.stderr


@then("the script exits 1 saying xbps-src is missing")
def then_missing_xbps_src(ctx):
    assert ctx.proc.returncode == 1
    assert "missing xbps-src" in ctx.proc.stderr
