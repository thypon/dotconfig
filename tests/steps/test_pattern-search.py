from pathlib import Path

from pytest_bdd import given, parsers, scenarios, then, when

scenarios("../features/bin/pattern-search.feature")


def write_lines(ctx, fname, words):
    (Path(ctx.env.cwd_dir) / fname).write_text("\n".join(words) + "\n")


@given(parsers.parse("a file {fname} with lines {words}"))
def given_file(ctx, fname, words):
    write_lines(ctx, fname, [w.strip() for w in words.split(",")])


@given("a file a.txt and a directory b.txt in the glob path")
def given_glob_path(ctx):
    write_lines(ctx, "a.txt", ["alpha"])
    subdir = Path(ctx.env.cwd_dir) / "b.txt"
    subdir.mkdir()
    (subdir / "inner.txt").write_text("alpha\n")


@when(parsers.parse('pattern-search runs on {fname} with "{p1}" and "{p2}"'))
def step_run(ctx, fname, p1, p2):
    ctx.proc = ctx.env.run("pattern-search", fname, p1, p2)


@when("pattern-search runs with the glob and one pattern")
def step_run_glob(ctx):
    ctx.proc = ctx.env.run("pattern-search", "*.txt", "alpha")


@then("log.txt is printed")
def step_printed(ctx):
    assert ctx.proc.stdout.splitlines() == ["log.txt"]


@then("log.txt is not printed")
def step_not_printed(ctx):
    assert "log.txt" not in ctx.proc.stdout.splitlines()


@then("only a.txt is examined")
def step_only_a(ctx):
    assert ctx.proc.returncode == 0
    assert ctx.proc.stdout.splitlines() == ["a.txt"]