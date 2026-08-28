import re
import subprocess

from pytest_bdd import scenarios, then, when

scenarios("../features/bin/stopwatch.feature")


@when("stopwatch runs")
def step_run(ctx):
    try:
        ctx.proc = ctx.env.run("stopwatch", timeout=2)
        ctx.killed = False
    except subprocess.TimeoutExpired as exc:
        ctx.proc = exc
        ctx.killed = True


@then("the output shows an incrementing H:M:S elapsed counter")
def step_format(ctx):
    assert ctx.killed, "stopwatch should still be running when the timeout hits"
    out = ctx.proc.stdout or b""
    if isinstance(out, bytes):
        out = out.decode(errors="replace")
    stamps = re.findall(r"\d{2}:\d{2}:\d{2}", out)
    assert len(stamps) >= 2, "expected multiple elapsed stamps"
    assert stamps[-1] >= stamps[0], "elapsed counter must be incrementing"


@then("the process keeps running until terminated")
def step_keeps_running(ctx):
    assert ctx.killed
