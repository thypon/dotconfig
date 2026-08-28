import textwrap
from pathlib import Path

from pytest_bdd import given, parsers, scenarios, then, when

scenarios("../features/bin/android-call.feature")

FAKESLEEP_RB = """
module Kernel
  alias_method :__real_sleep, :sleep
  def sleep(*args)
    if ENV['EVENT_LOG'] && !args.empty?
      File.open(ENV['EVENT_LOG'], 'a') { |f| f.puts "sleep #{args.map(&:to_s).join(' ')}" }
    end
    __real_sleep(0)
  end
end
"""


def _ensure_setup(ctx):
    if getattr(ctx, "call_ready", False):
        return
    preload = ctx.env.state_dir / "fakesleep.rb"
    preload.write_text(textwrap.dedent(FAKESLEEP_RB).strip() + "\n")
    ctx.env.shim("ruby", 'exec /usr/bin/ruby -r "%s" "$@"' % preload)
    ctx.env.shim("adb", 'echo "adb $*" >> "$EVENT_LOG"')
    ctx.env.set_env(EVENT_LOG=str(ctx.env.state_dir / "events.log"))
    ctx.call_ready = True


def _events(ctx):
    path = Path(ctx.env.state_dir / "events.log")
    if not path.exists():
        return []
    return [line.strip() for line in path.read_text().splitlines() if line.strip()]


def _adb_line(number):
    return "adb shell service call phone 1 s16 %s 2 s16 %s" % (number, number)


@given(parsers.parse("CALL_SLEEP is {secs:d}"))
def given_call_sleep(ctx, secs):
    ctx.env.set_env(CALL_SLEEP=str(secs))


@when(parsers.re(r'android-call runs with "(?P<number>[^"]+)"'))
def step_run_one(ctx, number):
    _ensure_setup(ctx)
    ctx.numbers = [number]
    ctx.proc = ctx.env.run("android-call", number)


@when(parsers.re(r'android-call runs with "(?P<first>[^"]+)" and "(?P<second>[^"]+)"'))
def step_run_two(ctx, first, second):
    _ensure_setup(ctx)
    ctx.numbers = [first, second]
    ctx.proc = ctx.env.run("android-call", first, second)


@then("adb shell service call phone is invoked with the URL-encoded number")
def then_adb_invoked(ctx):
    lines = _events(ctx)
    assert len(lines) == 1
    assert lines[0] == _adb_line(ctx.numbers[0])


@then("the output mentions calling the number")
def then_output(ctx):
    assert "Calling %s" % ctx.numbers[0] in ctx.proc.stdout


@then(parsers.parse("sleep {secs:d} happens between the two adb calls"))
def then_sleep_between(ctx, secs):
    first, second = ctx.numbers
    events = _events(ctx)
    assert events[0] == _adb_line(first)
    assert events[1] == "sleep %d" % secs
    assert events[2] == _adb_line(second)
