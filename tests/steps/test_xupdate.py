"""Steps for ossnix/.local/bin/xupdate.

The script runs ./xbps-src update-check from the repo root (the sandbox
cwd), seds version=/revision= in the template, then calls xgensum -i and
xbump. macOS BSD sed cannot run the script's GNU-style `sed -i expr
file`, so sed is shimmed onto perl -pi -e; xbps-src (repo-root shim),
xgensum and xbump are logged and canned via state files.
"""

from pytest_bdd import given, parsers, scenarios, then, when

scenarios("../features/bin/xupdate.feature")

TEMPLATE_1_0 = (
    "pkgname=pkg-a\n"
    "version=1.0\n"
    "revision=2\n"
    'maintainer="abc@pompel.me"\n'
    "checksum=abc123\n"
)

SED_SHIM = '''
echo "sed $*" >> "$SED_LOG"
exec /usr/bin/perl -pi -e "$2" "$3"
'''

XGENSUM_SHIM = '''
echo "xgensum $*" >> "$XGENSUM_LOG"
'''

XBUMP_SHIM = '''
echo "xbump $*" >> "$XBUMP_LOG"
'''

XBPS_SRC_SHIM = '''#!/bin/sh
echo "xbps-src $*" >> "$XBPS_SRC_LOG"
if [ "$1" = "update-check" ]; then
  cat "$UPDCHECK_OUT" 2>/dev/null
fi
exit 0
'''


def _make_repo(ctx, template):
    pkgdir = ctx.env.cwd_dir / "srcpkgs" / "pkg-a"
    pkgdir.mkdir(parents=True)
    (pkgdir / "template").write_text(template)
    xbps_src = ctx.env.cwd_dir / "xbps-src"
    xbps_src.write_text(XBPS_SRC_SHIM)
    xbps_src.chmod(0o755)
    for name, body in (
        ("sed", SED_SHIM),
        ("xgensum", XGENSUM_SHIM),
        ("xbump", XBUMP_SHIM),
    ):
        ctx.env.shim(name, body)
    state = ctx.env.state_dir
    ctx.env.set_env(
        SED_LOG=str(state / "sed.log"),
        XGENSUM_LOG=str(state / "xgensum.log"),
        XBUMP_LOG=str(state / "xbump.log"),
        XBPS_SRC_LOG=str(state / "xbps-src.log"),
        UPDCHECK_OUT=str(state / "update-check.out"),
    )
    return pkgdir / "template"


def _set_update_check(ctx, content):
    out = ctx.env.state_dir / "update-check.out"
    out.write_text(content)


@given("a void-packages repo with package pkg-a at version 1.0")
def given_repo_pkg_a(ctx):
    ctx.template = _make_repo(ctx, TEMPLATE_1_0)
    _set_update_check(ctx, "")


@given("xbps-src update-check reports 2.3")
def given_update_check(ctx):
    _set_update_check(ctx, "pkg-a-2.3\n")


@given("a void-packages repo with package pkg-a already at the latest version")
def given_already_updated(ctx):
    ctx.template = _make_repo(ctx, TEMPLATE_1_0)
    _set_update_check(ctx, "")


@when(parsers.parse('xupdate runs with "{pkg}"'))
def when_xupdate(ctx, pkg):
    ctx.proc = ctx.env.run("xupdate", pkg)


@then("srcpkgs/pkg-a/template has version=2.3 and revision=1")
def then_template_bumped(ctx):
    lines = (ctx.env.cwd_dir / "srcpkgs" / "pkg-a" / "template").read_text().splitlines()
    assert "version=2.3" in lines
    assert "revision=1" in lines
    assert "version=1.0" not in lines
    assert "revision=2" not in lines


@then("xgensum -i runs on the template")
def then_xgensum(ctx):
    log = (ctx.env.state_dir / "xgensum.log").read_text()
    assert "-i srcpkgs/pkg-a/template" in log


@then("xbump pkg-a runs")
def then_xbump(ctx):
    log = (ctx.env.state_dir / "xbump.log").read_text()
    assert "pkg-a" in log


@then("the output says the package is already updated")
def then_already_updated(ctx):
    assert "package already updated" in ctx.proc.stdout


@then("the template is untouched")
def then_untouched(ctx):
    assert ctx.template.read_text() == TEMPLATE_1_0
    assert not (ctx.env.state_dir / "xgensum.log").exists()
    assert not (ctx.env.state_dir / "xbump.log").exists()
