from pathlib import Path

from pytest_bdd import given, parsers, scenarios, then, when

scenarios("../features/bin/csv2confluence.feature")

CSV_NAME = "data.csv"


def write_csv(ctx, *lines):
    (Path(ctx.env.cwd_dir) / CSV_NAME).write_text("\n".join(lines) + "\n")


@given(parsers.parse('a CSV file with header "{row}"'))
def given_header(ctx, row):
    write_csv(ctx, row)


@given(parsers.parse('a CSV file with header and a data row "{row}"'))
def given_header_row(ctx, row):
    write_csv(ctx, "name,age", row)


@given(parsers.parse('a CSV file with line "{row}"'))
def given_line(ctx, row):
    write_csv(ctx, row)


@when("csv2confluence runs with the file")
def step_run(ctx):
    ctx.proc = ctx.env.run("csv2confluence", CSV_NAME)


@then(parsers.parse('the first output line is "{line}"'))
def step_first_line(ctx, line):
    assert ctx.proc.stdout.splitlines()[0] == line


@then(parsers.parse('the data row prints as "{line}"'))
def step_data_row(ctx, line):
    assert ctx.proc.stdout.splitlines()[-1] == line


@then("the output fields contain no surrounding spaces")
def step_fields_trimmed(ctx):
    for index, line in enumerate(ctx.proc.stdout.splitlines()):
        sep = "||" if index == 0 else "|"
        assert line.startswith(sep)
        assert line.endswith(sep)
        fields = line[len(sep):-len(sep)].split(sep)
        assert fields
        for field in fields:
            assert field == field.strip()