from pathlib import Path

from pytest_bdd import given, parsers, scenarios, then, when

scenarios("../features/bin/dealer.feature")

# dealer hardcodes /tmp/.deals as its output file (outside the test sandbox)
DEALER_OUTPUT = Path("/tmp/.deals")


@given("a Documents/deals file with three deals")
def deals_file(ctx):
    ctx.deals = {"alpha", "beta", "gamma"}
    docs = ctx.env.home / "Documents"
    docs.mkdir(parents=True, exist_ok=True)
    (docs / "deals").write_text("echo alpha\necho beta\necho gamma\n")


@given("no previous dealer output file")
def no_previous_output(ctx):
    try:
        DEALER_OUTPUT.unlink()
    except FileNotFoundError:
        pass


@when("dealer runs")
def dealer_runs(ctx):
    ctx.proc = ctx.env.run("dealer")


@when(parsers.parse("dealer runs {count:d} times"))
def dealer_runs_repeatedly(ctx, count):
    ctx.outputs = []
    for _ in range(count):
        try:
            DEALER_OUTPUT.unlink()
        except FileNotFoundError:
            pass
        ctx.proc = ctx.env.run("dealer")
        assert ctx.proc.returncode == 0, ctx.proc.stderr
        ctx.outputs.append(DEALER_OUTPUT.read_text().strip())
    ctx.proc = None


@then("the dealer output contains one of the deals")
def dealer_output_is_a_deal(ctx):
    assert DEALER_OUTPUT.exists()
    assert DEALER_OUTPUT.read_text().strip() in ctx.deals
    try:
        DEALER_OUTPUT.unlink()
    except FileNotFoundError:
        pass


@then("every dealer output was one of the deals")
def all_outputs_are_deals(ctx):
    assert ctx.outputs, "no runs were recorded"
    assert all(out in ctx.deals for out in ctx.outputs)