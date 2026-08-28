from pytest_bdd import given, parsers, scenarios, then, when

import test_gcleanup as _gcleanup
from test_gcleanup import (
    _ensure_gh,
    _gh_log_lines,
    _write_json,
)

for _text in (
    "the current directory is not a git repository",
    "a git repo with origin org/repo on github",
    "gh pr list returns no PR for the current branch",
    "PR {number} open for the current branch",
):
    globals()["pytestbdd_stepdef_given_" + _text] = getattr(
        _gcleanup, "pytestbdd_stepdef_given_" + _text
    )

scenarios("../features/bin/gfailed.feature")

JQ_SHIM = """\
exec /usr/bin/python3 -c '
import sys, json
try:
    data = json.load(sys.stdin)
except Exception:
    sys.exit(0)
for item in data:
    if item.get("state") in ("FAILURE", "ERROR", "CANCELLED"):
        sys.stdout.write("%s\\t%s\\n" % (item.get("name", ""), item.get("link", "")))
'
"""

JOBS = {
    "build": ("11", "build: error TS1234"),
    "lint": ("22", "lint: E501"),
}


def _ensure_jq(ctx):
    if getattr(ctx, "jq_ready", False):
        return
    ctx.env.shim("jq", JQ_SHIM)
    ctx.jq_ready = True


def _check(name, job, state):
    return {
        "name": name,
        "link": "https://github.com/myorg/myrepo/actions/runs/1/job/" + job,
        "state": state,
    }


@given("all checks are passing")
def given_all_checks_passing(ctx):
    _ensure_gh(ctx)
    _ensure_jq(ctx)
    _write_json(
        ctx,
        "checks.json",
        [_check("build", "11", "SUCCESS"), _check("lint", "22", "SUCCESS")],
    )


@given('checks "build" and "lint" failing')
def given_checks_failing(ctx):
    _ensure_gh(ctx)
    _ensure_jq(ctx)
    _write_json(
        ctx,
        "checks.json",
        [
            _check("build", "11", "FAILURE"),
            _check("lint", "22", "FAILURE"),
            _check("unit", "33", "SUCCESS"),
        ],
    )
    for job, line in JOBS.values():
        (ctx.env.state_dir / ("job-%s.log" % job)).write_text(line + "\n")


@given("a failed check whose URL ends with an empty job id")
def given_check_empty_job_id(ctx):
    _ensure_gh(ctx)
    _ensure_jq(ctx)
    _write_json(
        ctx,
        "checks.json",
        [
            {
                "name": "flaky",
                "link": "https://github.com/myorg/myrepo/actions/runs/9/job/",
                "state": "FAILURE",
            }
        ],
    )


@when("gfailed runs")
def when_gfailed_runs(ctx):
    ctx.proc = ctx.env.run("gfailed")


@then("the output says no failed checks")
def then_output_no_failed_checks(ctx):
    assert "No failed checks found." in ctx.proc.stdout


@then(parsers.parse("the job log for {name} is printed"))
def then_job_log_printed(ctx, name):
    job, line = JOBS[name]
    assert "=== Log for '%s' (Job ID: %s) ===" % (name, job) in ctx.proc.stdout
    assert line in ctx.proc.stdout


@then("the output says the job ID could not be extracted")
def then_output_no_job_id(ctx):
    assert "Could not extract job ID from URL" in ctx.proc.stdout


@then("no gh run view is called for that check")
def then_no_run_view(ctx):
    assert not [line for line in _gh_log_lines(ctx) if "run view" in line]
