from pytest_bdd import given, parsers, scenarios, then, when

scenarios("../features/bin/updateclock.feature")

DEFAULT_DATE = "Wed, 26 Aug 2026 10:00:00 GMT"

CURL_SHIM = """
echo "curl $*" >> "$CURL_LOG"
cat "$CURL_HEADERS"
"""

DATE_SHIM = """
echo "date $*" >> "$DATE_LOG"
"""

HWCLOCK_SHIM = """
echo "hwclock $*" >> "$HWCLOCK_LOG"
"""

SUDO_SHIM = """
echo "sudo $*" >> "$SUDO_LOG"
exec "$@"
"""


def _setup(ctx, header):
    ctx.curl_log = ctx.env.state_dir / "curl.log"
    ctx.date_log = ctx.env.state_dir / "date.log"
    ctx.hwclock_log = ctx.env.state_dir / "hwclock.log"
    ctx.sudo_log = ctx.env.state_dir / "sudo.log"
    headers = ctx.env.state_dir / "headers.txt"
    headers.write_text(f"HTTP/1.1 200 OK\n{header}\n")
    ctx.env.shim("curl", CURL_SHIM)
    ctx.env.shim("date", DATE_SHIM)
    ctx.env.shim("hwclock", HWCLOCK_SHIM)
    ctx.env.shim("sudo", SUDO_SHIM)
    ctx.env.set_env(
        CURL_LOG=str(ctx.curl_log),
        CURL_HEADERS=str(headers),
        DATE_LOG=str(ctx.date_log),
        HWCLOCK_LOG=str(ctx.hwclock_log),
        SUDO_LOG=str(ctx.sudo_log),
    )


@given(parsers.parse('curl returns header "{header}"'))
def given_curl_header(ctx, header):
    _setup(ctx, header)


@given("the system date was set")
def given_date_was_set(ctx):
    _setup(ctx, f"Date: {DEFAULT_DATE}")
    ctx.date_log.write_text(f"date -s {DEFAULT_DATE}\n")


@when("updateclock runs")
def when_updateclock_runs(ctx):
    ctx.proc = ctx.env.run("updateclock")


@then("sudo date -s receives that parsed date")
def then_date_set(ctx):
    assert ctx.date_log.read_text() == f"date -s {DEFAULT_DATE}\n"
    sudo_lines = ctx.sudo_log.read_text().splitlines()
    assert sudo_lines == [
        f"sudo date -s {DEFAULT_DATE}",
        "sudo hwclock -w --utc",
        "sudo hwclock -r --utc",
    ]
    assert ctx.proc.returncode == 0


@then("sudo hwclock -w --utc and hwclock -r --utc are invoked")
def then_hwclock(ctx):
    lines = ctx.hwclock_log.read_text().splitlines()
    assert lines == ["hwclock -w --utc", "hwclock -r --utc"]
    assert ctx.proc.returncode == 0
