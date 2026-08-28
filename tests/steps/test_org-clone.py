import json
import os
import re
import subprocess

from pytest_bdd import given, parsers, scenarios, then, when

scenarios("../features/bin/org-clone.feature")

GH_SHIM = '''
echo "gh $*" >> "$GH_LOG"
if [ "$1 $2" = "repo list" ]; then
  cat "$GH_LIST_JSON"
  exit 0
fi
exit 0
'''

JQ_SHIM = """
exec /usr/bin/python3 -c '
import sys, json
data = json.load(sys.stdin)
for item in data:
    sys.stdout.write("%s:%s\\n" % (item["name"], item["visibility"]))
' "$@"
"""

GIT_SHIM = '''
echo "git $*" >> "$GIT_LOG"
exec /usr/bin/git "$@"
'''

GIT_ENV = {
    "GIT_AUTHOR_NAME": "Test",
    "GIT_AUTHOR_EMAIL": "t@e",
    "GIT_COMMITTER_NAME": "Test",
    "GIT_COMMITTER_EMAIL": "t@e",
}

ENTRY_RE = re.compile(r"([A-Za-z0-9._-]+/[A-Za-z0-9._-]+) \(([A-Z]+)\)")


def _git(*args, cwd):
    subprocess.run(
        ["/usr/bin/git", *args],
        cwd=str(cwd),
        check=True,
        capture_output=True,
        env={**os.environ, **GIT_ENV},
    )


def _ensure_gh(ctx, entries=None):
    if getattr(ctx, "gh_ready", False):
        return
    state = ctx.env.state_dir
    ctx.env.shim("gh", GH_SHIM)
    ctx.env.shim("jq", JQ_SHIM)
    ctx.env.shim("git", GIT_SHIM)
    payload = [
        {"name": full.split("/")[-1], "visibility": vis}
        for full, vis in (entries or [])
    ]
    (state / "gh-list.json").write_text(json.dumps(payload))
    ctx.env.set_env(
        GH_LOG=str(state / "gh.log"),
        GH_LIST_JSON=str(state / "gh-list.json"),
        GIT_LOG=str(state / "git.log"),
    )
    ctx.gh_ready = True


def _gh_lines(ctx):
    log = ctx.env.state_dir / "gh.log"
    return log.read_text().splitlines() if log.exists() else []


def _git_lines(ctx):
    log = ctx.env.state_dir / "git.log"
    return log.read_text().splitlines() if log.exists() else []


@given(parsers.re(r"gh repo list returns (?P<spec>.+)"))
def given_gh_repo_list_returns(ctx, spec):
    spec = spec.strip()
    if spec.startswith("repos "):
        spec = spec[len("repos "):]
    entries = [(m.group(1), m.group(2)) for m in ENTRY_RE.finditer(spec)]
    assert entries, f"no repo entries parsed from: {spec}"
    _ensure_gh(ctx, entries)


@given(parsers.parse("no directory {name} exists"))
def given_no_directory_exists(ctx, name):
    assert not (ctx.env.cwd_dir / name).exists()


@given(parsers.parse("directory {name} is an existing git repo"))
def given_directory_is_git_repo(ctx, name):
    _ensure_gh(ctx)
    repo = ctx.env.cwd_dir / name
    remote = ctx.env.home / "fixtures" / f"{name}.git"
    _git("init", "--bare", "-b", "main", str(remote), cwd=ctx.env.home)
    _git("init", "-b", "main", str(repo), cwd=ctx.env.cwd_dir)
    (repo / "README.md").write_text("existing\n")
    _git("-C", str(repo), "add", "README.md", cwd=repo)
    _git("-C", str(repo), "commit", "-m", "init", cwd=repo)
    _git("-C", str(repo), "remote", "add", "origin", str(remote), cwd=repo)
    _git("-C", str(repo), "push", "-u", "origin", "main", cwd=repo)


@when(parsers.parse('org-clone runs with "{org}"'))
def when_org_clone_runs(ctx, org):
    _ensure_gh(ctx)
    ctx.proc = ctx.env.run("org-clone", org)


@when('org-clone runs with --depth and 1 and "acme"')
def when_org_clone_runs_with_flags(ctx):
    _ensure_gh(ctx)
    ctx.proc = ctx.env.run("org-clone", "--depth", "1", "acme")


@then("gh repo list is called with acme and --no-archived")
def then_list_called_with_acme(ctx):
    lists = [l.split() for l in _gh_lines(ctx) if l.startswith("gh repo list")]
    assert lists
    assert any("acme" in tokens and "--no-archived" in tokens for tokens in lists)


@then(parsers.parse("gh repo clone {repo} into {target}"))
def then_clone_called(ctx, repo, target):
    clones = [l.split() for l in _gh_lines(ctx) if l.startswith("gh repo clone")]
    assert any(tokens[3:5] == [repo, target] for tokens in clones)


@then("gh repo clone is not called")
def then_clone_not_called(ctx):
    assert not [l for l in _gh_lines(ctx) if l.startswith("gh repo clone")]


@then("git pull runs in cli")
def then_git_pull_runs(ctx):
    pulls = [l.split() for l in _git_lines(ctx) if l.startswith("git -C ")]
    assert any(tokens == ["git", "-C", "cli", "pull"] for tokens in pulls)


@then("the org argument used is acme")
def then_org_argument_is_acme(ctx):
    lists = [l.split() for l in _gh_lines(ctx) if l.startswith("gh repo list")]
    assert lists
    assert lists[-1][3] == "acme"