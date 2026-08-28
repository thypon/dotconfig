from pathlib import Path

from pytest_bdd import given, parsers, scenarios, then, when

scenarios("../features/bin/cl.feature")


@given("a directory work containing files")
def given_work(ctx):
    work = Path(ctx.env.cwd_dir) / "work"
    work.mkdir()
    (work / "notes.txt").write_text("hello\n")
    (work / "data.csv").write_text("a,b\n")


@given("no directory nowhere exists")
def given_missing(ctx):
    pass


@when(parsers.parse('cl runs with "{name}"'))
def step_run(ctx, name):
    ctx.proc = ctx.env.run("cl", name)


@then("a long listing of work is printed")
def step_listing(ctx):
    out = ctx.proc.stdout
    assert "total" in out
    assert "notes.txt" in out
    assert "data.csv" in out