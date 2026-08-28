import os

from pytest_bdd import given, parsers, scenarios, then, when

scenarios("../features/bin/repo-dir.feature")


@given("/repo/.repo exists and cwd is /repo/sub/deep")
def given_ancestor_holds_dotrepo(ctx):
    root = ctx.env.home / "repo"
    (root / ".repo").mkdir(parents=True)
    deep = root / "sub" / "deep"
    deep.mkdir(parents=True)
    cwd = ctx.env.cwd_dir
    cwd.rmdir()
    os.symlink(str(deep), str(cwd))
    ctx.expected = os.path.realpath(root)


@given("no ancestor contains .repo")
def given_no_ancestor_has_dotrepo(ctx):
    d = ctx.env.cwd_dir
    while str(d) != "/":
        assert not (d / ".repo").exists(), f"unexpected .repo in {d}"
        d = d.parent


@given("cwd is /tmp/somewhere")
def given_cwd_somewhere(ctx):
    ctx.expected = os.path.realpath(ctx.env.cwd_dir)


@when("repo-dir runs")
def when_repo_dir_runs(ctx):
    ctx.proc = ctx.env.run("repo-dir")


@then(parsers.parse("the output is {path}"))
def then_output_is(ctx, path):
    out = ctx.proc.stdout
    # macOS /bin/sh (bash in POSIX mode) prints "-n " literally.
    if out.startswith("-n "):
        out = out[len("-n "):]
    assert out.strip() == str(ctx.expected)
