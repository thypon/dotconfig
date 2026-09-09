import time

from pytest_bdd import given, parsers, scenarios, then, when

scenarios("../features/bin/xhomepage.feature")

XBPS_QUERY_SHIM = """#!/bin/sh
if [ -n "$FAKE_NO_HOMEPAGE" ]; then
  echo "pkgname: pkg"
  exit 0
fi
echo "pkgname: pkg"
echo "homepage: $FAKE_HOMEPAGE"
"""

XDG_OPEN_SHIM = """#!/bin/sh
echo "$1" >> "$XDG_OPEN_LOG"
"""


@given(parsers.parse('xbps-query reports homepage "{url}"'))
def xbps_reports_homepage(url, ctx):
    ctx.xdg_log = ctx.env.state_dir / "xdg-open.log"
    ctx.env.shim("xbps-query", XBPS_QUERY_SHIM)
    ctx.env.shim("xdg-open", XDG_OPEN_SHIM)
    ctx.env.set_env(FAKE_HOMEPAGE=url, XDG_OPEN_LOG=str(ctx.xdg_log))


@given("xbps-query reports no homepage")
def xbps_reports_no_homepage(ctx):
    xbps_reports_homepage("", ctx)
    ctx.env.set_env(FAKE_NO_HOMEPAGE="1")


@when(parsers.parse('xhomepage runs with "{pkg}"'))
def xhomepage_runs(ctx, pkg):
    ctx.proc = ctx.env.run("xhomepage", pkg)


def _await_xdg_log(ctx):
    deadline = time.time() + 5
    while time.time() < deadline and not ctx.xdg_log.exists():
        time.sleep(0.05)


@then(parsers.parse('xdg-open was called with "{url}"'))
def xdg_open_called_with(url, ctx):
    _await_xdg_log(ctx)
    assert ctx.xdg_log.exists(), ctx.proc.stderr
    assert ctx.xdg_log.read_text().splitlines() == [url]


@then("xdg-open received no URL")
def xdg_open_received_no_url(ctx):
    _await_xdg_log(ctx)
    assert ctx.xdg_log.exists(), ctx.proc.stderr
    assert ctx.xdg_log.read_text().splitlines() == [""]