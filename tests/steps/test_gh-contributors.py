import itertools
import os
import subprocess
from datetime import datetime, timedelta, timezone

from pytest_bdd import given, parsers, scenarios, then, when

scenarios("../features/bin/gh-contributors.feature")

GH_SHIM = """\
echo "gh $*" >> "$GH_LOG"
email=""
for a in "$@"; do
  case "$a" in
    *author=*) email="${a##*author=}" ;;
  esac
done
if [ -n "$email" ] && [ -f "$GH_LOGIN_MAP" ]; then
  login=$(grep -F "$email " "$GH_LOGIN_MAP" | head -n 1 | cut -d " " -f 2)
  if [ -n "$login" ]; then
    echo "$login"
  fi
fi
exit 0
"""

_counter = itertools.count()


def _make_repo(ctx, name):
    repo = ctx.env.home / name
    repo.mkdir(parents=True, exist_ok=True)
    for args in (
        ["init", "-b", "main"],
        ["config", "user.name", "Test User"],
        ["config", "user.email", "test@example.com"],
        ["remote", "add", "origin", "https://github.com/myorg/%s.git" % name],
    ):
        subprocess.run(
            ["/usr/bin/git", *args], cwd=str(repo), check=True, capture_output=True
        )
    return repo


def _commit(ctx, repo, email, days_ago=0):
    when = (
        datetime.now(timezone.utc) - timedelta(days=days_ago)
    ).strftime("%Y-%m-%dT%H:%M:%S+00:00")
    path = repo / ("file-%d.txt" % next(_counter))
    path.write_text("x\n")
    env = {**os.environ, "GIT_AUTHOR_DATE": when, "GIT_COMMITTER_DATE": when}
    subprocess.run(
        ["/usr/bin/git", "add", path.name],
        cwd=str(repo), check=True, capture_output=True, env=env,
    )
    subprocess.run(
        ["/usr/bin/git", "commit", "--author", "Contributor <%s>" % email, "-m", "c"],
        cwd=str(repo), check=True, capture_output=True, env=env,
    )


def _ensure_gh(ctx, mapping=None):
    if not getattr(ctx, "gh_ready", False):
        ctx.env.shim("gh", GH_SHIM)
        ctx.gh_ready = True
    ctx.env.set_env(
        GH_LOG=str(ctx.env.state_dir / "gh.log"),
        GH_LOGIN_MAP=str(ctx.env.state_dir / "login-map.txt"),
    )
    if mapping:
        (ctx.env.state_dir / "login-map.txt").write_text(
            "".join("%s %s\n" % pair for pair in mapping)
        )


@given(parsers.parse("a repo with contributor {email}"))
def given_repo_with_contributor(ctx, email):
    ctx.repo = _make_repo(ctx, "repo1")
    ctx.contrib_email = email
    _commit(ctx, ctx.repo, email)


@given(parsers.parse('the commits API maps that email to login "{login}"'))
def given_api_maps_email(ctx, login):
    _ensure_gh(ctx, mapping=[(ctx.contrib_email, login)])


@given(parsers.parse("two repos sharing contributor {email}"))
def given_two_repos_share(ctx, email):
    ctx.repos = [_make_repo(ctx, "repoA"), _make_repo(ctx, "repoB")]
    for repo in ctx.repos:
        _commit(ctx, repo, email)


@given("a contributor active 400 days ago")
def given_old_contributor(ctx):
    if not hasattr(ctx, "repo"):
        ctx.repo = _make_repo(ctx, "repo1")
    _commit(ctx, ctx.repo, "111+olduser@users.noreply.github.com", days_ago=400)


@given("a contributor active 10 days ago")
def given_recent_contributor(ctx):
    _commit(ctx, ctx.repo, "222+newuser@users.noreply.github.com", days_ago=10)


@when("gh-contributors runs on that repo")
def when_runs_on_repo(ctx):
    ctx.proc = ctx.env.run("gh-contributors", "365", str(ctx.repo))


@when("gh-contributors runs on both")
def when_runs_on_both(ctx):
    ctx.proc = ctx.env.run("gh-contributors", "365", *[str(r) for r in ctx.repos])


@when(parsers.parse("gh-contributors runs with {days} and that repo"))
def when_runs_with_days(ctx, days):
    ctx.proc = ctx.env.run("gh-contributors", days, str(ctx.repo))


@then(parsers.parse('the output contains "{text}"'))
def then_output_contains(ctx, text):
    assert text in ctx.proc.stdout


@then(parsers.parse('"{text}" appears exactly once'))
def then_appears_once(ctx, text):
    assert ctx.proc.stdout.count(text) == 1


@then("only the recent contributor is listed")
def then_only_recent(ctx):
    assert "newuser" in ctx.proc.stdout
    assert "olduser" not in ctx.proc.stdout
