from pytest_bdd import given, parsers, scenarios, then, when

scenarios("../features/bin/aosp-report2manifest.feature")

RUN_PREFIX = "vendor/"


def _write_report(ctx, line):
    report = ctx.env.state_dir / "report.csv"
    report.write_text(line + "\n")
    return report


def _project_lines(ctx):
    return [l for l in ctx.proc.stdout.splitlines() if "<project " in l]


@given(parsers.parse('a report line "{line}"'))
def given_report_line(ctx, line):
    ctx.line = line


@given("a report with at least one matching row")
def given_matching_row(ctx):
    ctx.line = "vendor/x,branch_a,branch_b,target_b,0"


@when(parsers.parse('aosp-report2manifest runs with the report and prefix "{prefix}"'))
def when_runs_with_prefix(ctx, prefix):
    report = _write_report(ctx, ctx.line)
    ctx.proc = ctx.env.run("aosp-report2manifest", str(report), prefix)


@when("aosp-report2manifest runs")
def when_runs(ctx):
    report = _write_report(ctx, ctx.line)
    ctx.proc = ctx.env.run("aosp-report2manifest", str(report), RUN_PREFIX)


@then(parsers.parse('the manifest contains remove-project name="{name}"'))
def then_remove_project(ctx, name):
    assert f'<remove-project name="{name}" />' in ctx.proc.stdout


@then(parsers.parse('the manifest contains project name="{name}" path="{path}"'))
def then_project(ctx, name, path):
    assert f'<project name="{name}" path="{path}" remote="aosp" />' in ctx.proc.stdout


@then(parsers.parse('the project element carries revision="{revision}"'))
def then_revision(ctx, revision):
    projects = _project_lines(ctx)
    assert len(projects) == 1
    assert f'revision="{revision}"' in projects[0]


@then(parsers.parse("the manifest contains no project for {project}"))
def then_no_project(ctx, project):
    assert project not in ctx.proc.stdout
    assert not _project_lines(ctx)
    assert "<remove-project" not in ctx.proc.stdout


@then("the output starts with the XML declaration")
def then_starts_with_decl(ctx):
    assert ctx.proc.stdout.splitlines()[0] == '<?xml version="1.0" encoding="UTF-8"?>'


@then("the output ends with the closing manifest tag")
def then_ends_with_manifest(ctx):
    lines = [l for l in ctx.proc.stdout.splitlines() if l.strip()]
    assert lines[-1] == "</manifest>"
