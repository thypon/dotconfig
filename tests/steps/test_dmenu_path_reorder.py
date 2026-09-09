from pytest_bdd import given, parsers, scenarios, then, when

from sed_shim import install_sed

scenarios("../features/bin/dmenu_path_reorder.feature")


@given(parsers.parse("a dmenu_run cache with programs {programs}"))
def dmenu_cache(ctx, programs):
    install_sed(ctx)
    names = [p.strip() for p in programs.replace(" and ", ",").split(",")]
    cache_dir = ctx.env.home / ".cache"
    cache_dir.mkdir(parents=True, exist_ok=True)
    ctx.cache = cache_dir / "dmenu_run"
    ctx.cache.write_text("\n".join(names) + "\n")


@when(parsers.parse('dmenu_path_reorder runs with "{program}"'))
def reorder_runs(ctx, program):
    ctx.proc = ctx.env.run("dmenu_path_reorder", program)


@when("dmenu_path_reorder runs with no arguments")
def reorder_runs_without_args(ctx):
    ctx.proc = ctx.env.run("dmenu_path_reorder")


@then(parsers.parse('the cache lists "{program}" first'))
def cache_lists_first(ctx, program):
    lines = ctx.cache.read_text().splitlines()
    assert lines[0] == program, lines


@then(parsers.parse('stdout names the program "{program}"'))
def stdout_names_program(ctx, program):
    assert ctx.proc.stdout.strip() == program


@then(parsers.parse("the cache still lists {programs} in order"))
def cache_untouched(ctx, programs):
    names = [p.strip() for p in programs.replace(" and ", ",").split(",")]
    assert ctx.cache.read_text().splitlines() == names