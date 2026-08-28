"""Steps for ossnix/.local/bin/xfixupdate.

The script curls the void-updates log, fgreps its maintainer address out
of srcpkgs/*/template and greps the log for each maintained package.
cwd must be the void-packages root, so fixtures build srcpkgs/ directly
in the sandbox cwd and curl is shimmed to cat a canned log body.
"""

from pytest_bdd import given, scenarios, then, when

scenarios("../features/bin/xfixupdate.feature")

MAINTAINER = "abc@pompel.me"

PKG_A_LINES = [
    "pkg-a-2.0_1: built successfully",
    "pkg-a-2.0_1: xbps-src: build failed, deleting builddir",
]

CURL_SHIM = '''
echo "curl $*" >> "$CURL_LOG"
cat "$FAKE_UPDATES_LOG"
'''


def _make_srcpkgs(ctx, pkgs):
    for pkg in pkgs:
        pkgdir = ctx.env.cwd_dir / "srcpkgs" / pkg
        pkgdir.mkdir(parents=True)
        (pkgdir / "template").write_text(
            f'pkgname={pkg}\nversion=1.0\nrevision=1\nmaintainer="{MAINTAINER}"\n'
        )


def _set_log(ctx, lines):
    log = ctx.env.state_dir / "void-updates.log"
    log.write_text("".join(line + "\n" for line in lines))
    ctx.env.shim("curl", CURL_SHIM)
    ctx.env.set_env(
        FAKE_UPDATES_LOG=str(log),
        CURL_LOG=str(ctx.env.state_dir / "curl.log"),
    )


@given("srcpkgs/pkg-a/template and pkg-b/template are maintained by abc@pompel.me")
def given_two_maintained(ctx):
    _make_srcpkgs(ctx, ["pkg-a", "pkg-b"])


@given("srcpkgs/pkg-a/template is maintained by abc@pompel.me")
def given_one_maintained(ctx):
    _make_srcpkgs(ctx, ["pkg-a"])


@given("the build log has entries for pkg-a and pkg-c")
def given_log_entries(ctx):
    _set_log(ctx, PKG_A_LINES + ["pkg-c-9.9_1: built successfully"])


@given("the build log has no pkg-a entry")
def given_log_no_pkg_a(ctx):
    _set_log(ctx, ["pkg-c-9.9_1: built successfully"])


@when("xfixupdate runs")
def when_xfixupdate(ctx):
    ctx.proc = ctx.env.run("xfixupdate")


@then("the pkg-a log lines are printed")
def then_pkg_a_lines(ctx):
    for line in PKG_A_LINES:
        assert line in ctx.proc.stdout


@then("pkg-c lines are not printed")
def then_no_pkg_c(ctx):
    assert "pkg-c" not in ctx.proc.stdout


@then("no pkg-a lines are printed and the script exits 0")
def then_no_pkg_a_exit_0(ctx):
    assert ctx.proc.stdout == ""
    assert ctx.proc.returncode == 0
