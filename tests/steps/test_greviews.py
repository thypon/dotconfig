import json

import test_gcleanup as _gcleanup
from gh_common import install_jq
from pytest_bdd import given, parsers, scenarios, then, when

for _text in (
    "the current directory is not a git repository",
    "a git repo with origin org/repo on github",
    "gh pr list returns no PR for the current branch",
    "PR {number} open for the current branch",
):
    globals()["pytestbdd_stepdef_given_" + _text] = getattr(
        _gcleanup, "pytestbdd_stepdef_given_" + _text
    )

scenarios("../features/bin/greviews.feature")

GH_SHIM = 'exec /usr/bin/python3 "$GH_PY" "$@"'

GH_PY = """
import json
import os
import sys

args = sys.argv[1:]
with open(os.environ["GH_LOG"], "a") as log:
    log.write(" ".join(["gh"] + args) + chr(10))

if args and args[0] == "pr":
    with open(os.environ["GH_PR_NUMBER"]) as fh:
        sys.stdout.write(fh.read())
    sys.exit(0)

path = args[1] if len(args) > 1 else ""
prog = ""
if "--jq" in args:
    prog = args[args.index("--jq") + 1]

def load(name):
    with open(os.environ[name]) as fh:
        return json.load(fh)

if path.endswith("/comments"):
    print(json.dumps(load("GH_COMMENTS_JSON")))
    sys.exit(0)

reviews = load("GH_REVIEWS_JSON")
if path.endswith("/reviews"):
    excluded = set()
    for chunk in prog.split("!=")[1:]:
        first = chunk.find(chr(34))
        last = chunk.find(chr(34), first + 1)
        if first >= 0 and last > first:
            excluded.add(chunk[first + 1:last])
    reviews = [r for r in reviews if r.get("user", {}).get("login") not in excluded]

if prog.strip().endswith(".id"):
    for r in reviews:
        sys.stdout.write(str(r["id"]) + chr(10))
    sys.exit(0)

out = []
for r in reviews:
    out.append({
        "id": r["id"],
        "user": r["user"]["login"],
        "state": r["state"],
        "body": r["body"],
        "submitted_at": r["submitted_at"],
    })
print(json.dumps(out))
"""


def _ensure_gh(ctx, pr_number="", reviews=None, comments=None):
    install_jq(ctx)
    state = ctx.env.state_dir
    (state / "pr-number.txt").write_text(pr_number)
    (state / "reviews.json").write_text(json.dumps(reviews or []))
    (state / "comments.json").write_text(json.dumps(comments or []))
    helper = state / "gh_helper.py"
    helper.write_text(GH_PY)
    ctx.env.shim("gh", GH_SHIM)
    ctx.env.set_env(
        GH_LOG=str(state / "gh.log"),
        GH_PR_NUMBER=str(state / "pr-number.txt"),
        GH_REVIEWS_JSON=str(state / "reviews.json"),
        GH_COMMENTS_JSON=str(state / "comments.json"),
        GH_PY=str(helper),
    )


ALICE_REVIEW = {
    "id": 101,
    "user": {"login": "alice"},
    "state": "COMMENTED",
    "body": "Looks fine overall",
    "submitted_at": "2026-03-04T09:00:00Z",
}

ALICE_COMMENT = {
    "user": "alice",
    "body": "Use a constant here",
    "diff_hunk": "@@ -1,3 +1,4 @@\n def main():\n-    return 1\n+    return MAGIC",
    "path": "src/main.py",
    "line": 4,
    "created_at": "2026-03-04T09:30:00Z",
}

BOB_REVIEW = {
    "id": 102,
    "user": {"login": "bob"},
    "state": "CHANGES_REQUESTED",
    "body": "Please extract a helper",
    "submitted_at": "2026-03-04T11:00:00Z",
}


@given("a review by alice with one comment")
def given_alice_review(ctx):
    _ensure_gh(
        ctx,
        pr_number=str(getattr(ctx, "pr_number", 3)),
        reviews=[ALICE_REVIEW],
        comments=[ALICE_COMMENT],
    )


@given("reviews by alice and bob")
def given_alice_bob_reviews(ctx):
    _ensure_gh(
        ctx,
        pr_number=str(getattr(ctx, "pr_number", 3)),
        reviews=[ALICE_REVIEW, BOB_REVIEW],
        comments=[ALICE_COMMENT],
    )


@when("greviews runs")
def when_greviews_runs(ctx):
    ctx.proc = ctx.env.run("greviews")


@when(parsers.parse('greviews runs with "{user}"'))
def when_greviews_runs_with(ctx, user):
    ctx.proc = ctx.env.run("greviews", user)


@then("the review by alice is shown")
def then_alice_review_shown(ctx):
    out = ctx.proc.stdout
    assert '"user": "alice"' in out
    assert "COMMENTED" in out
    assert "Looks fine overall" in out


@then("the comment diff hunk is shown")
def then_diff_hunk_shown(ctx):
    out = ctx.proc.stdout
    assert "--- Review ID: 101 ---" in out
    assert "@@ -1,3 +1,4 @@" in out
    assert "src/main.py" in out
    assert "Use a constant here" in out


@then("bob's review is not shown")
def then_bob_not_shown(ctx):
    out = ctx.proc.stdout
    assert "bob" not in out
    assert "CHANGES_REQUESTED" not in out


@then("alice's review is shown")
def then_alice_shown(ctx):
    assert '"user": "alice"' in ctx.proc.stdout
