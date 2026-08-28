import json
import subprocess

from pytest_bdd import given, parsers, scenarios, then, when

scenarios("../features/bin/gcleanup.feature")

GH_FAKE = r'''import json
import os
import sys

args = sys.argv[1:]
log = os.environ.get("GH_LOG")
if log:
    with open(log, "a") as fh:
        fh.write("gh " + " ".join(args) + "\n")

state = os.environ.get("GH_STATE", "")


def fixture(rel):
    path = os.path.join(state, rel)
    if not os.path.isfile(path):
        return None
    with open(path) as fh:
        return json.load(fh)


def emit(values):
    for value in values:
        sys.stdout.write(str(value) + "\n")


def bot_ids(items):
    return [
        i["id"] for i in items
        if i.get("user", {}).get("login") == "github-actions[bot]"
    ]


if args[:2] == ["pr", "list"]:
    number = os.environ.get("GH_PR_NUMBER", "")
    if number:
        emit([number])
    sys.exit(0)

if args[:2] == ["pr", "checks"]:
    checks = fixture("checks.json")
    if checks is not None:
        emit([json.dumps(checks)])
    sys.exit(0)

if args[:2] == ["run", "view"]:
    job = args[args.index("--job") + 1]
    path = os.path.join(state, "job-%s.log" % job)
    if os.path.isfile(path):
        with open(path) as fh:
            sys.stdout.write(fh.read())
    sys.exit(0)

if args[:1] == ["api"]:
    rest = args[1:]
    if rest[:1] == ["-X"]:
        sys.exit(0)
    endpoint = rest[0].split("?")[0].strip("/").split("/")
    jq = rest[rest.index("--jq") + 1] if "--jq" in rest else ""
    data = None
    if endpoint[-1] == "comments" and endpoint[-3] == "issues":
        data = fixture("issue-comments.json")
    elif endpoint[-1:] == ["reviews"]:
        data = fixture("pull-reviews.json")
    elif endpoint[-3] == "reviews" and endpoint[-1] == "comments":
        data = fixture("review-%s-comments.json" % endpoint[-2])
    if data is None:
        sys.exit(0)
    if jq == ".[].id":
        emit([i["id"] for i in data])
    else:
        emit(bot_ids(data))
    sys.exit(0)

sys.exit(0)
'''


def _init_repo(ctx, remote_url):
    repo = ctx.env.cwd_dir
    for args in (["init", "-b", "main"], ["remote", "add", "origin", remote_url]):
        subprocess.run(
            ["/usr/bin/git", *args], cwd=str(repo), check=True, capture_output=True
        )
    return repo


def _ensure_gh(ctx):
    if getattr(ctx, "gh_ready", False):
        return
    state = ctx.env.state_dir
    fake = state / "gh_fake.py"
    fake.write_text(GH_FAKE)
    ctx.env.shim("gh", 'exec /usr/bin/python3 "$GH_FAKE" "$@"')
    ctx.env.set_env(
        GH_FAKE=str(fake),
        GH_STATE=str(state),
        GH_LOG=str(state / "gh.log"),
    )
    ctx.gh_ready = True


def _write_json(ctx, rel, data):
    (ctx.env.state_dir / rel).write_text(json.dumps(data))


def _gh_log_lines(ctx):
    log = ctx.env.state_dir / "gh.log"
    return log.read_text().splitlines() if log.exists() else []


def _delete_lines(ctx):
    return [line for line in _gh_log_lines(ctx) if "-X DELETE" in line]


@given("the current directory is not a git repository")
def given_cwd_not_git_repo(ctx):
    assert not (ctx.env.cwd_dir / ".git").exists()


@given("a git repo with origin https://gitlab.com/foo/bar.git")
def given_git_repo_gitlab(ctx):
    _init_repo(ctx, "https://gitlab.com/foo/bar.git")


@given("a git repo with origin on github.com")
def given_git_repo_github_com(ctx):
    _ensure_gh(ctx)
    _init_repo(ctx, "https://github.com/myorg/myrepo.git")


@given("a git repo with origin org/repo on github")
def given_git_repo_org_repo(ctx):
    given_git_repo_github_com(ctx)


@given("gh pr list returns no PR for the current branch")
def given_gh_no_pr(ctx):
    _ensure_gh(ctx)
    ctx.env.set_env(GH_PR_NUMBER="")


@given(parsers.parse("PR {number} open for the current branch"))
def given_pr_open(ctx, number):
    _ensure_gh(ctx)
    ctx.env.set_env(GH_PR_NUMBER=number)


@given("github-actions[bot] left 2 issue comments and 1 review comment")
def given_bot_comments(ctx):
    _write_json(
        ctx,
        "issue-comments.json",
        [
            {"id": 101, "user": {"login": "github-actions[bot]"}},
            {"id": 102, "user": {"login": "alice"}},
            {"id": 103, "user": {"login": "github-actions[bot]"}},
        ],
    )
    _write_json(
        ctx,
        "pull-reviews.json",
        [
            {"id": 501, "user": {"login": "github-actions[bot]"}},
            {"id": 502, "user": {"login": "bob"}},
        ],
    )
    _write_json(ctx, "review-501-comments.json", [{"id": 601}])
    _write_json(ctx, "review-502-comments.json", [{"id": 602}])


@given("only human comments exist")
def given_human_comments(ctx):
    _write_json(ctx, "issue-comments.json", [{"id": 102, "user": {"login": "alice"}}])
    _write_json(ctx, "pull-reviews.json", [{"id": 502, "user": {"login": "bob"}}])


@when("gcleanup runs")
def when_gcleanup_runs(ctx):
    ctx.proc = ctx.env.run("gcleanup")


@then("the output says no origin remote found")
def then_output_no_origin(ctx):
    assert "Error: Not in a git repository or no origin remote found" in ctx.proc.stdout


@then(parsers.parse("all {count} bot comments are deleted via gh api DELETE"))
def then_bot_comments_deleted(ctx, count):
    dels = _delete_lines(ctx)
    assert len(dels) == int(count)
    assert any("repos/myorg/myrepo/issues/comments/101" in line for line in dels)
    assert any("repos/myorg/myrepo/issues/comments/103" in line for line in dels)
    assert any("repos/myorg/myrepo/pulls/comments/601" in line for line in dels)


@then("non-bot comments are untouched")
def then_non_bot_untouched(ctx):
    dels = _delete_lines(ctx)
    assert not any(
        "/issues/comments/102" in line or "/pulls/comments/602" in line
        for line in dels
    )
    assert not any("reviews/502/comments" in line for line in _gh_log_lines(ctx))


@then("no DELETE api calls are made")
def then_no_deletes(ctx):
    assert not _delete_lines(ctx)
