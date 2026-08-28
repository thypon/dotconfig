"""Steps for ossnix/.local/bin/xlazy.

The sandbox cwd is turned into a fake void-packages git checkout:
repo-root ./xbps-src is a shim answering `show` from a state file and
logging build invocations; PATH shims provide xbps-uhelper (host arch),
xupdate (optionally failing), flock and cp.

macOS environment notes:
- There is no /usr/bin/flock and fd-based flock cannot be emulated by a
  shim, so `flock <fd>` is a logged no-op while `flock <file> <cmd>` is
  logged and exec'd. The "second invocation queues on the same arch"
  scenario was therefore replaced by asserting xupdate runs under the
  update lock.
- BSD cp lacks --reflink=always; the cp shim logs the call (asserting
  the script passed the flag) and strips it for the real copy.
- The rollback prompt opens /dev/tty; run the tests from a
  non-interactive shell so the script takes its documented
  non-interactive branch.
"""

import subprocess

from pytest_bdd import given, parsers, scenarios, then, when

scenarios("../features/bin/xlazy.feature")

FLOCK_SHIM = '''
echo "flock $*" >> "$FLOCK_LOG"
if [ -n "$2" ]; then
  shift
  exec "$@"
fi
'''

CP_SHIM = '''
echo "cp $*" >> "$CP_LOG"
if [ "$2" = "--reflink=always" ]; then
  exec /bin/cp -a "$3" "$4"
fi
exec /bin/cp "$@"
'''

XBPS_UHELPER_SHIM = '''
if [ "$1" = "arch" ]; then
  echo "${FAKE_HOST_ARCH:-x86_64}"
fi
'''

XUPDATE_SHIM = '''
echo "xupdate $*" >> "$XUPDATE_LOG"
if [ "$1" = "$XUPDATE_FAIL_PKG" ]; then
  echo "xupdate: failed to update $1" >&2
  exit 1
fi
'''

XBPS_SRC_REPO_SHIM = '''#!/bin/sh
echo "xbps-src $*" >> "$XBPS_SRC_LOG"
if [ "$3" = "show" ]; then
  cat "$SHOW_OUT" 2>/dev/null
  exit 0
fi
for last; do :; done
if [ -n "$XBPS_FAIL_PKG" ] && [ "$last" = "$XBPS_FAIL_PKG" ]; then
  echo "=> ERROR: $last build failed" >&2
  echo "=> xbps-src: error: pkg build failed" >&2
  exit 1
fi
exit 0
'''


def _git(*args, cwd):
    subprocess.run(
        ["/usr/bin/git", "-c", "user.name=t", "-c", "user.email=t@e", *args],
        cwd=str(cwd),
        check=True,
        capture_output=True,
    )


def _add_masterdir(repo, arch, bootstrapped=True):
    masterdir = repo / ("masterdir" if arch is None else f"masterdir-{arch}")
    masterdir.mkdir()
    if bootstrapped:
        (masterdir / ".xbps_chroot_init").write_text("bootstrapped\n")
    return masterdir


def _make_repo(ctx):
    repo = ctx.env.cwd_dir
    ctx.repo = repo
    pkgdir = repo / "srcpkgs" / "pkg-a"
    pkgdir.mkdir(parents=True)
    (pkgdir / "template").write_text("pkgname=pkg-a\nversion=1.0\nrevision=1\n")
    xbps_src = repo / "xbps-src"
    xbps_src.write_text(XBPS_SRC_REPO_SHIM)
    xbps_src.chmod(0o755)
    _git("init", "-q", "-b", "main", str(repo), cwd=repo.parent)
    _git("-C", str(repo), "add", "-A", cwd=repo)
    _git("-C", str(repo), "commit", "-q", "-m", "initial import", cwd=repo)
    ctx.head = subprocess.run(
        ["/usr/bin/git", "-C", str(repo), "rev-parse", "HEAD"],
        check=True,
        capture_output=True,
        text=True,
    ).stdout.strip()
    for name, body in (
        ("flock", FLOCK_SHIM),
        ("cp", CP_SHIM),
        ("xbps-uhelper", XBPS_UHELPER_SHIM),
        ("xupdate", XUPDATE_SHIM),
    ):
        ctx.env.shim(name, body)
    state = ctx.env.state_dir
    show_out = state / "show.out"
    show_out.write_text("")
    ctx.env.set_env(
        FAKE_HOST_ARCH="x86_64",
        FLOCK_LOG=str(state / "flock.log"),
        CP_LOG=str(state / "cp.log"),
        XUPDATE_LOG=str(state / "xupdate.log"),
        XBPS_SRC_LOG=str(state / "xbps-src.log"),
        SHOW_OUT=str(show_out),
    )
    return repo


def _show_out_path(ctx):
    return ctx.env.state_dir / "show.out"


def _log_path(ctx, name):
    return ctx.env.state_dir / name


@given("a void-packages checkout")
def given_checkout(ctx):
    _make_repo(ctx)


@given("a void-packages repo with masterdir for the host arch")
def given_repo_host_masterdir(ctx):
    repo = _make_repo(ctx)
    _add_masterdir(repo, None)


@given("a void-packages repo with a foreign masterdir arch")
def given_repo_foreign_masterdir(ctx):
    repo = _make_repo(ctx)
    _add_masterdir(repo, "x86_64")
    _add_masterdir(repo, "aarch64", bootstrapped=False)
    cross_profiles = repo / "common" / "cross-profiles"
    cross_profiles.mkdir(parents=True)
    (cross_profiles / "aarch64.sh").write_text("#!/bin/sh\n")


@given("a void-packages repo with no srcpkgs/ghost")
def given_repo_no_ghost(ctx):
    repo = _make_repo(ctx)
    _add_masterdir(repo, None)


@given("the current directory is a git repository without xbps-src")
def given_git_repo_without_xbps_src(ctx):
    _git("init", "-q", "-b", "main", str(ctx.env.cwd_dir), cwd=ctx.env.cwd_dir.parent)


@given("package pkg-a builds for the host arch natively")
def given_pkg_native(ctx):
    _show_out_path(ctx).write_text("")


@given("package pkg-a supports cross for that arch")
def given_pkg_cross(ctx):
    _show_out_path(ctx).write_text("")


@given("package pkg-a declares nocross")
def given_pkg_nocross(ctx):
    _show_out_path(ctx).write_text("nocross:\t1\n")


@given("package pkg-a restricts archs to x86_64")
def given_pkg_archs(ctx):
    _show_out_path(ctx).write_text("archs:\tx86_64\n")


@given("xupdate fails for pkg-a")
def given_xupdate_fails(ctx):
    repo = _make_repo(ctx)
    _add_masterdir(repo, None)
    ctx.env.set_env(XUPDATE_FAIL_PKG="pkg-a")


@given("xbps-src fails for pkg-a on the host arch")
def given_xbps_src_fails(ctx):
    repo = _make_repo(ctx)
    _add_masterdir(repo, None)
    ctx.env.set_env(XBPS_FAIL_PKG="pkg-a")


@given("masterdir-xlazy-<arch> already exists and is bootstrapped")
def given_existing_clone(ctx):
    repo = _make_repo(ctx)
    _add_masterdir(repo, None)
    clone = _add_masterdir(repo, "xlazy-x86_64")
    ctx.clone = clone


@when(parsers.parse('xlazy runs with "{pkg}"'))
def when_xlazy(ctx, pkg):
    ctx.proc = ctx.env.run("xlazy", pkg)


@when("xlazy runs with no arguments")
def when_xlazy_no_args(ctx):
    ctx.proc = ctx.env.run("xlazy")


@then("the usage line is printed and the script exits 1")
def then_usage(ctx):
    assert ctx.proc.returncode == 1
    assert "usage: xlazy <pkg1> [pkg2 ...]" in ctx.proc.stderr


@then("the script exits 1 mentioning xbps-src")
def then_exit1_xbps_src(ctx):
    assert ctx.proc.returncode == 1
    assert "missing xbps-src" in ctx.proc.stderr


@then('the output lists ghost under "unknown packages"')
def then_unknown_ghost(ctx):
    assert "xlazy: unknown packages:" in ctx.proc.stderr
    assert "\n  ghost" in ctx.proc.stderr


@then("masterdir-xlazy-<arch> is created with cp --reflink=always")
def then_reflink_clone(ctx):
    clone = ctx.repo / "masterdir-xlazy-x86_64"
    assert (clone / ".xbps_chroot_init").is_file()
    cp_log = _log_path(ctx, "cp.log").read_text()
    assert "--reflink=always" in cp_log
    assert str(ctx.repo / "masterdir") in cp_log
    assert str(clone) in cp_log


@then("xbps-src pkg runs in the clone and the package is listed as built")
def then_built_in_clone(ctx):
    xbps_log = _log_path(ctx, "xbps-src.log").read_text()
    clone = ctx.repo / "masterdir-xlazy-x86_64"
    assert str(clone) in xbps_log
    assert "-Q" in xbps_log
    assert "pkg pkg-a" in xbps_log
    assert "xlazy: building pkg-a (x86_64)" in ctx.proc.stderr
    assert "xlazy: built packages:" in ctx.proc.stderr
    assert "pkg-a (x86_64)" in ctx.proc.stderr


@then("xbps-src -m clone -a <arch> pkg pkg-a runs")
def then_cross_build(ctx):
    xbps_log = _log_path(ctx, "xbps-src.log").read_text()
    assert str(ctx.repo / "masterdir-xlazy-aarch64") in xbps_log
    assert "-a aarch64" in xbps_log
    assert "pkg pkg-a" in xbps_log


@then("the clone is a COW copy of the host masterdir")
def then_cow_copy(ctx):
    cp_log = _log_path(ctx, "cp.log").read_text()
    assert "--reflink=always" in cp_log
    assert str(ctx.repo / "masterdir-x86_64") in cp_log
    assert str(ctx.repo / "masterdir-xlazy-aarch64") in cp_log


@then('the foreign arch is listed under "skipped" with nocross reason')
def then_skipped_nocross(ctx):
    assert "xlazy: skipped:" in ctx.proc.stderr
    assert "pkg-a (aarch64: nocross)" in ctx.proc.stderr


@then("other arches are skipped with an archs reason")
def then_skipped_archs(ctx):
    assert "xlazy: skipped:" in ctx.proc.stderr
    assert "pkg-a (aarch64: archs)" in ctx.proc.stderr


@then('the output lists pkg-a under "update failures"')
def then_update_failures(ctx):
    assert "xlazy: update failures:" in ctx.proc.stderr
    assert "\n  pkg-a" in ctx.proc.stderr


@then("the pre-build commit is remembered for rollback")
def then_rollback_recorded(ctx):
    assert "srcpkgs/pkg-a <- " in ctx.proc.stderr
    assert f"srcpkgs/pkg-a <- {ctx.head}" in ctx.proc.stderr


@then("the last 80 log lines are printed")
def then_log_tail(ctx):
    assert "xlazy: build failed: pkg-a (x86_64); last log lines:" in ctx.proc.stderr
    assert "=> ERROR: pkg-a build failed" in ctx.proc.stderr


@then("no new clone is created")
def then_no_new_clone(ctx):
    cp_log_file = _log_path(ctx, "cp.log")
    assert not cp_log_file.exists() or cp_log_file.read_text() == ""
    assert (ctx.clone / ".xbps_chroot_init").is_file()
    xbps_log = _log_path(ctx, "xbps-src.log").read_text()
    assert str(ctx.clone) in xbps_log


@then("xupdate pkg-a runs while holding the update lock")
def then_update_lock(ctx):
    flock_log = _log_path(ctx, "flock.log").read_text()
    assert f"{ctx.repo}/.git/xlazy/update.lock xupdate pkg-a" in flock_log
