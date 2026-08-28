import json
import re

import test_gcleanup as _gcleanup
from gh_common import install_jq
from pytest_bdd import given, parsers, scenarios, then, when

for _text in (
    "a git repo with origin org/repo on github",
):
    globals()["pytestbdd_stepdef_given_" + _text] = getattr(
        _gcleanup, "pytestbdd_stepdef_given_" + _text
    )

scenarios("../features/bin/gissue.feature")

GH_SHIM = '''echo "gh $*" >> "$GH_LOG"
exec cat "$GH_GRAPHQL_JSON"
'''

NULL_ISSUE = {"data": {"repository": {"issue": None}}}


def _set_fixture(ctx, payload):
    install_jq(ctx)
    state = ctx.env.state_dir
    path = state / "graphql.json"
    path.write_text(json.dumps(payload))
    ctx.env.shim("gh", GH_SHIM)
    ctx.env.set_env(
        GH_LOG=str(state / "gh.log"),
        GH_GRAPHQL_JSON=str(path),
    )
    ctx.graphql_path = path


def _default_fixture(ctx):
    if not getattr(ctx, "graphql_path", None):
        _set_fixture(ctx, NULL_ISSUE)


def _gh_log(ctx):
    log = ctx.env.state_dir / "gh.log"
    return log.read_text() if log.exists() else ""


@given(parsers.parse("issue {number:d} exists with one comment"))
def given_issue_with_comment(ctx, number):
    _set_fixture(ctx, {
        "data": {"repository": {"issue": {
            "title": "Fix login flow",
            "author": {"login": "alice"},
            "createdAt": "2026-01-02T09:00:00Z",
            "body": "Steps to reproduce:\n1. Open app\n2. Login fails",
            "comments": {"nodes": [
                {
                    "author": {"login": "bob"},
                    "createdAt": "2026-01-02T10:00:00Z",
                    "body": "Repro confirmed on macOS.",
                },
            ]},
        }}},
    })
    ctx.number = number


@given(parsers.re(r"issue (?P<url>https://\S+) exists"))
def given_issue_url(ctx, url):
    number = int(re.search(r"/issues/(\d+)", url).group(1))
    org_repo = re.search(r"github\.com/([^/]+/[^/]+)/issues", url).group(1)
    _set_fixture(ctx, {
        "data": {"repository": {"issue": {
            "title": "URL issue title",
            "author": {"login": "carol"},
            "createdAt": "2026-02-03T09:00:00Z",
            "body": "Filed from URL fixture",
            "comments": {"nodes": []},
        }}},
    })
    ctx.number = number
    ctx.org_repo = org_repo
    ctx.url = url


@when("gissue runs with no arguments")
def when_no_args(ctx):
    _default_fixture(ctx)
    ctx.proc = ctx.env.run("gissue")


@when(parsers.parse('gissue runs with "{arg}"'))
def when_runs_with_arg(ctx, arg):
    _default_fixture(ctx)
    ctx.proc = ctx.env.run("gissue", arg)


@when("gissue runs with the URL")
def when_runs_with_url(ctx):
    ctx.proc = ctx.env.run("gissue", ctx.url)


@then("the usage line is printed")
def then_usage(ctx):
    out = ctx.proc.stdout
    assert "Usage:" in out
    assert "<issue-number | issue-url>" in out


@then("the issue title, author and body are printed")
def then_issue_details(ctx):
    out = ctx.proc.stdout
    assert "Issue #%d: Fix login flow" % ctx.number in out
    assert "Opened by: alice on 2026-01-02T09:00:00Z" in out
    assert "2. Login fails" in out
    header = re.search(r"Getting issue #\d+ and comments from (\S+?)\.\.\.", out)
    assert header
    owner, name = header.group(1).split("/", 1)
    log = _gh_log(ctx)
    assert 'repository(owner: "%s", name: "%s")' % (owner, name) in log
    assert "issue(number: %d)" % ctx.number in log


@then("the comment author and body are printed")
def then_comment_details(ctx):
    out = ctx.proc.stdout
    assert "[bob] 2026-01-02T10:00:00Z" in out
    assert "Repro confirmed on macOS." in out


@then("the fetched issue is other/repo#99")
def then_fetched_from_url(ctx):
    out = ctx.proc.stdout
    assert "Getting issue #99 and comments from other/repo..." in out
    assert "Issue #99: URL issue title" in out
    log = _gh_log(ctx)
    assert 'repository(owner: "other", name: "repo")' in log
    assert "issue(number: 99)" in log


@then("the output says the issue may not exist")
def then_may_not_exist(ctx):
    assert "may not exist" in ctx.proc.stdout
