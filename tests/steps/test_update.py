import os

from pytest_bdd import given, parsers, scenarios, then, when

scenarios("../features/update.feature")

GIT_SHIM = """#!/bin/sh
echo "git $*" >> "$GIT_LOG"
if [ "$1" = "rev-parse" ] && [ "$2" = "--show-toplevel" ]; then
  printf '%s\\n' "$FAKE_TOP"
  exit 0
fi
exit 1
"""

PROVIDER_SHIM = """#!/bin/sh
echo "provider args=[$*]" >> "$PROVIDER_LOG"
"""

MACOS_INSTALL_STUB = """#!/bin/sh
echo "macos-install $*" >> "$MACOS_INSTALL_LOG"
"""


def _touch(ctx, relpath, content):
    path = ctx.toplevel / relpath
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content)


@given("a fake repo toplevel with common files")
def fake_toplevel(ctx):
    top = ctx.env.home.parent / "toplevel"
    top.mkdir()
    ctx.toplevel = top
    ctx.common = top / "common"
    ctx.common.mkdir()
    _touch(ctx, "common/.config/foo/bar.conf", "bar-content\n")
    _touch(ctx, "common/.gitconfig", "[user]\n\tname = repo\n")
    _touch(ctx, "common/.config/opencode/plugins/testplug/plugin.js", "// plug\n")
    _touch(ctx, "common/.config/opencode/commands/greet.tmpl", "hello dynamic/model\n")
    _touch(ctx, "common/.config/pi/prompts/hi.tmpl", "hi dynamic/model\n")
    _touch(ctx, "common/node_modules/dep/index.js", "node\n")
    _touch(ctx, "common/services/svc.sh", "#!/bin/sh\n")
    _touch(ctx, "common/install.sh", "#!/bin/sh\n")
    ctx.env.shim("git", GIT_SHIM)
    ctx.env.set_env(FAKE_TOP=str(top), GIT_LOG=str(ctx.env.state_dir / "git.log"))


@given("the home already has a .gitconfig")
def home_has_gitconfig(ctx):
    (ctx.env.home / ".gitconfig").write_text("user config")


@given("the provider binary is installed in home")
def provider_installed_in_home(ctx):
    provider_dir = ctx.env.home / ".local" / "bin"
    provider_dir.mkdir(parents=True, exist_ok=True)
    path = provider_dir / "provider"
    path.write_text(PROVIDER_SHIM)
    path.chmod(0o755)
    ctx.provider_log = ctx.env.state_dir / "provider.log"
    ctx.env.set_env(PROVIDER_LOG=str(ctx.provider_log))


@given("a fake macos installer in the toplevel")
def fake_macos_installer(ctx):
    _touch(ctx, "macos/install.sh", MACOS_INSTALL_STUB)
    ctx.macos_install_log = ctx.env.state_dir / "macos-install.log"
    ctx.env.set_env(MACOS_INSTALL_LOG=str(ctx.macos_install_log))


@given("the pi config directory in home is a symlink")
def pi_config_is_symlink(ctx):
    real = ctx.env.state_dir / "pi-real"
    real.mkdir(parents=True, exist_ok=True)
    link = ctx.env.home / ".config" / "pi"
    link.parent.mkdir(parents=True, exist_ok=True)
    link.symlink_to(real)
    ctx.pi_link = link
    ctx.pi_real = real


@when("the update hook runs")
def update_hook_runs(ctx):
    ctx.proc = ctx.env.run("update")


@then("the hook exits 0")
def hook_exits_zero(ctx):
    assert ctx.proc.returncode == 0, (ctx.proc.returncode, ctx.proc.stderr)


@then(parsers.parse('the home path "{relpath}" is a symlink into the repo'))
def home_path_is_repo_symlink(relpath, ctx):
    p = ctx.env.home / relpath
    assert os.path.islink(p), p
    assert os.path.realpath(p) == str(ctx.common / relpath), p


@then(parsers.parse('the home path "{relpath}" is a regular copy'))
def home_path_is_regular_copy(relpath, ctx):
    p = ctx.env.home / relpath
    assert p.exists() and not os.path.islink(p), p
    assert p.read_text() == (ctx.common / relpath).read_text(), p


@then(parsers.parse('the home path "{relpath}" is a copy of the repo file "{src}"'))
def home_path_is_copy_of(relpath, src, ctx):
    p = ctx.env.home / relpath
    assert p.exists() and not os.path.islink(p), p
    assert p.read_text() == (ctx.common / src).read_text(), p


@then(parsers.parse('the home path "{relpath}" is a regular file with content "{content}"'))
def home_path_is_regular_file(relpath, content, ctx):
    p = ctx.env.home / relpath
    assert p.exists() and not os.path.islink(p), p
    assert p.read_text() == content, p.read_text()


@then(parsers.parse('the home path "{relpath}" does not exist'))
def home_path_absent(relpath, ctx):
    assert not (ctx.env.home / relpath).exists(), relpath


@then("the provider re-resolution ran")
def provider_reresolution_ran(ctx):
    assert ctx.provider_log.exists()
    assert ctx.provider_log.read_text().splitlines() == ["provider args=[]"]


@then("the macos installer ran")
def macos_installer_ran(ctx):
    assert ctx.macos_install_log.exists()


@then("the hook reports no macos directory")
def hook_reports_no_macos(ctx):
    assert "No macos/ directory found" in ctx.proc.stdout, ctx.proc.stdout


@then("the pi config directory is still a symlink")
def pi_config_still_symlink(ctx):
    assert ctx.pi_link.is_symlink()
    assert not list(ctx.pi_real.iterdir()), list(ctx.pi_real.iterdir())