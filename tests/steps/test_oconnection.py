from pathlib import Path

from pytest_bdd import given, parsers, scenarios, then, when

scenarios("../features/bin/oconnection.feature")


@given("the oconnection state dir is sandboxed")
def given_state_dir(ctx):
    ctx.state = ctx.env.state_dir / "oconnection"
    ctx.env.set_env(OCONNECTION_STATE_DIR=str(ctx.state))


@given("the gate is manually paused")
def given_manual_pause(ctx):
    ctx.proc = ctx.env.run("oconnection", "pause")


@given("the gate is auto paused")
def given_auto_pause(ctx):
    ctx.proc = ctx.env.run("oconnection", "pause", "--auto")


@when("oconnection pauses")
def when_pause(ctx):
    ctx.proc = ctx.env.run("oconnection", "pause")


@when("oconnection pauses with the auto flag")
def when_pause_auto(ctx):
    ctx.proc = ctx.env.run("oconnection", "pause", "--auto")


@when("oconnection unpauses")
def when_unpause(ctx):
    ctx.proc = ctx.env.run("oconnection", "unpause")


@when(parsers.parse("oconnection unpauses with {flag}"))
def when_unpause_flag(ctx, flag):
    args = {"--all": ["--all"], "the auto flag": ["--auto"]}[flag]
    ctx.proc = ctx.env.run("oconnection", "unpause", *args)


@when("oconnection reports status")
def when_status(ctx):
    ctx.proc = ctx.env.run("oconnection", "status")


@then(parsers.parse('oconnection status says "{text}"'))
def then_status_says(ctx, text):
    ctx.proc = ctx.env.run("oconnection", "status")
    assert text in ctx.proc.stdout, f"expected '{text}' in {ctx.proc.stdout!r}"


@when("oconnection wakes with a passing check url")
def when_wake_passing(ctx):
    ok_file = ctx.env.state_dir / "online"
    ok_file.write_text("ok")
    ctx.env.set_env(
        OCONNECTION_CHECK_URL="file://" + str(ok_file),
        OCONNECTION_CHECK_INTERVAL="0",
    )
    ctx.proc = ctx.env.run("oconnection", "wake")


@when("oconnection wakes with a failing check url")
def when_wake_failing(ctx):
    ctx.env.set_env(
        OCONNECTION_CHECK_URL="file://" + str(ctx.env.state_dir / "no-such-check"),
        OCONNECTION_CHECK_INTERVAL="0",
        OCONNECTION_WAKE_MAX="1",
    )
    ctx.proc = ctx.env.run("oconnection", "wake")


@when(parsers.parse('oconnection runs "{command}"'))
def when_run_command(ctx, command):
    ctx.proc = ctx.env.run("oconnection", command)


@then("the pause flag exists in the state dir")
def then_manual_flag(ctx):
    assert (ctx.state / "paused").is_file()


@then("the pause flag does not exist in the state dir")
def then_no_manual_flag(ctx):
    assert not (ctx.state / "paused").exists()


@then("the auto pause flag exists in the state dir")
def then_auto_flag(ctx):
    assert (ctx.state / "paused.auto").is_file()


@then("no pause flag exists in the state dir")
def then_no_flags(ctx):
    assert not (ctx.state / "paused").exists()
    assert not (ctx.state / "paused.auto").exists()


@then("the usage is printed")
def then_usage(ctx):
    assert "oconnection pause [--auto]" in ctx.proc.stderr
    assert "oconnection status" in ctx.proc.stderr