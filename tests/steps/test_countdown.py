import re

from pytest_bdd import parsers, scenarios, then, when

scenarios("../features/bin/countdown.feature")


@when(parsers.parse("countdown runs with {arg}"))
def step_run(ctx, arg):
    ctx.proc = ctx.env.run("countdown", arg, timeout=15)


@then("the script exits 0 within a few seconds")
def step_exit_quick(ctx):
    assert ctx.proc.returncode == 0


@then("the output contains a H:M:S formatted countdown")
def step_format(ctx):
    assert re.search(r"\d{2}:\d{2}:\d{2}", ctx.proc.stdout)
