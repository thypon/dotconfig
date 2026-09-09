import re
import subprocess

from pytest_bdd import given, parsers, scenarios, then, when

from sed_shim import install_sed

scenarios("../features/bin/xrevert.feature")


def _git(ctx, *args):
    return subprocess.run(
        ["git", *args],
        cwd=ctx.env.cwd_dir,
        capture_output=True,
        text=True,
    )


def _commit_all(ctx, message):
    res = _git(ctx, "add", "-A")
    assert res.returncode == 0, res.stderr
    res = _git(ctx, "commit", "-qm", message)
    assert res.returncode == 0, res.stderr


def _template_path(ctx, pkg=None):
    return ctx.env.cwd_dir / "srcpkgs" / (pkg or ctx.pkg) / "template"


@given("a void git repo")
def void_git_repo(ctx):
    install_sed(ctx)
    res = _git(ctx, "init", "-q", ".")
    assert res.returncode == 0, res.stderr
    assert _git(ctx, "config", "user.name", "test").returncode == 0
    assert _git(ctx, "config", "user.email", "test@example.com").returncode == 0
    res = _git(ctx, "commit", "--allow-empty", "-qm", "init")
    assert res.returncode == 0, res.stderr


@given(parsers.parse('package "{pkg}" template at version "{ver}" revision "{rev}"'))
def package_template(ctx, pkg, ver, rev):
    ctx.pkg = pkg
    tdir = _template_path(ctx, pkg).parent
    tdir.mkdir(parents=True)
    _template_path(ctx, pkg).write_text(f"version={ver}\nrevision={rev}\n")
    _commit_all(ctx, f"{pkg}: initial template")


@given(parsers.parse(
    'package "{pkg}" template at version "{ver}" revision "{rev}" with reverts "{reverts}"'
))
def package_template_with_reverts(ctx, pkg, ver, rev, reverts):
    ctx.pkg = pkg
    tdir = _template_path(ctx, pkg).parent
    tdir.mkdir(parents=True)
    _template_path(ctx, pkg).write_text(
        f'reverts="{reverts}"\nversion={ver}\nrevision={rev}\n'
    )
    _commit_all(ctx, f"{pkg}: initial template")


@given(parsers.parse('package "{pkg}" template is bumped to revision "{rev}"'))
def package_template_bumped(ctx, pkg, rev):
    assert pkg == ctx.pkg
    tpath = _template_path(ctx)
    lines = tpath.read_text().splitlines()
    lines = [f"revision={rev}" if line.startswith("revision=") else line for line in lines]
    tpath.write_text("\n".join(lines) + "\n")
    ctx.bump_msg = f"{ctx.pkg}: bump revision"
    _commit_all(ctx, ctx.bump_msg)


@when(parsers.parse('xrevert runs with "{pkg}"'))
def xrevert_runs(ctx, pkg):
    ctx.proc = ctx.env.run("xrevert", pkg)


@when(parsers.parse('xrevert runs with "{pkg}" with VAR set'))
def xrevert_runs_with_var(ctx, pkg):
    ctx.env.set_env(VAR="1")
    ctx.proc = ctx.env.run("xrevert", pkg)


@then(parsers.parse('the template records reverts "{value}"'))
def template_records_reverts(ctx, value):
    text = _template_path(ctx).read_text()
    match = re.search(r'^reverts=("?)(.*)\1$', text, re.MULTILINE)
    assert match, text
    assert match.group(2) == value, text


@then(parsers.parse('the template keeps version "{ver}" and revision "{rev}"'))
def template_keeps_version(ctx, ver, rev):
    text = _template_path(ctx).read_text()
    assert f"version={ver}" in text, text
    assert f"revision={rev}" in text, text


@then("the latest commit is a revert")
def latest_commit_is_revert(ctx):
    res = _git(ctx, "log", "-1", "--pretty=%s")
    assert res.stdout.strip() == f'Revert "{ctx.bump_msg}"', res.stdout


@then("the repo has a single commit")
def repo_single_commit(ctx):
    res = _git(ctx, "log", "--oneline")
    assert len(res.stdout.splitlines()) == 1, res.stdout