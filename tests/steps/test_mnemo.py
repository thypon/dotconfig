import re
from datetime import date
from pathlib import Path

from pytest_bdd import given, parsers, scenarios, then, when

scenarios("../features/bin/mnemo.feature")

MONTHS = {
    "Jan": 1,
    "Feb": 2,
    "Mar": 3,
    "Apr": 4,
    "May": 5,
    "Jun": 6,
    "Jul": 7,
    "Aug": 8,
    "Sep": 9,
    "Oct": 10,
    "Nov": 11,
    "Dec": 12,
}

ENTRY_RE = re.compile(r"^(\d{4}) (\w{3}) (\d{2}), (.*)$")

RUBY_SHIM = """
if [ "$1" = "-e" ] && [ -n "$FAKE_TODAY" ]; then
  fixed=$(printf '%s' "$2" | sed 's/Date\\.today/Date.parse(ENV["FAKE_TODAY"])/')
  shift 2
  exec /usr/bin/ruby -e "$fixed" "$@"
fi
exec /usr/bin/ruby "$@"
"""


def calendar_path(ctx):
    return Path(ctx.env.home) / "Documents" / "calendar"


def parse_dated_line(line):
    m = ENTRY_RE.match(line)
    assert m, f"malformed calendar line: {line!r}"
    return date(int(m.group(1)), MONTHS[m.group(2)], int(m.group(3)))


@given("a HOME with a Documents/calendar file")
def given_home(ctx):
    calendar_path(ctx).parent.mkdir(parents=True, exist_ok=True)
    calendar_path(ctx).write_text("seed entry\n")
    ctx.cal_before = 1


@given("today is 2026-08-27")
def given_today(ctx):
    ctx.env.set_env(FAKE_TODAY="2026-08-27")
    ctx.env.shim("ruby", RUBY_SHIM)


@when(parsers.parse('mnemo runs with "{text}"'))
def step_run(ctx, text):
    ctx.entry_text = text
    ctx.proc = ctx.env.run("mnemo", text)


@then("calendar has 4 new lines")
def step_new_lines(ctx):
    lines = calendar_path(ctx).read_text().splitlines()
    new = lines[ctx.cal_before:]
    assert len(new) == 4
    ctx.new_lines = new


@then(parsers.parse('every line ends with "{text}"'))
def step_lines_end_with(ctx, text):
    for line in ctx.new_lines:
        assert line.endswith(text)


@then(parsers.parse("calendar contains dates {dates}"))
def step_dates(ctx, dates):
    expected = [
        date.fromisoformat(d) for d in dates.replace(" and ", ", ").split(", ")
    ]
    got = [
        parse_dated_line(line)
        for line in calendar_path(ctx).read_text().splitlines()[ctx.cal_before:]
    ]
    assert got == expected