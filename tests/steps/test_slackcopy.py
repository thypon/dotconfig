import shutil
from pathlib import Path

from pytest_bdd import given, parsers, scenarios, then, when

scenarios("../features/bin/slackcopy.feature")

PBCOPY_SHIM = """cat > "$PBCOPY_FILE"
printf 'called' >> "$PBCOPY_LOG"
"""

OSASCRIPT_SHIM = """echo "$@" >> "$OSASCRIPT_LOG"
"""


def _bun_path():
    bun = shutil.which("bun")
    assert bun, "bun is required to run slackcopy"
    return str(Path(bun).parent)


def _cache_dir():
    return str(Path.home() / ".bun" / "install" / "cache")


def _base_env(ctx):
    return {
        # script_env's HOME is a tmp dir; keep bun's package cache usable
        "BUN_INSTALL_CACHE_DIR": str(Path.home() / ".bun" / "install" / "cache"),
        "PATH": f"{_bun_path()}:{ctx.env.bin_dir}:/usr/bin:/bin:/usr/sbin:/sbin",
    }


@given("osascript is available")
def given_osascript(ctx):
    ctx.env.set_env(
        OSASCRIPT_LOG=str(ctx.env.state_dir / "osascript.log"),
        **_base_env(ctx),
    )
    ctx.env.shim("osascript", 'echo "$@" >> "$OSASCRIPT_LOG"')


@given("osascript is not on PATH")
def given_no_osascript(ctx):
    # No /usr/bin: bun still runs, but slackcopy's osascript spawn cannot.
    ctx.env.set_env(
        PATH=f"{_bun_path()}:{ctx.env.bin_dir}",
        **{k: v for k, v in _base_env(ctx).items() if k != "PATH"},
    )


@given("pbcopy is available")
def given_pbcopy(ctx):
    ctx.env.set_env(
        PBCOPY_FILE=str(ctx.env.state_dir / "clip.txt"),
        PBCOPY_LOG=str(ctx.env.state_dir / "pbcopy.log"),
        **_base_env(ctx),
    )
    ctx.env.shim("pbcopy", PBCOPY_SHIM)


@given("pbcopy is not on PATH")
def given_no_pbcopy(ctx):
    # PATH holds only the shims dir + bun: no /usr/bin, so pbcopy
    # (which lives in /usr/bin on macOS) cannot be found.
    ctx.env.set_env(PATH=f"{_bun_path()}:{ctx.env.bin_dir}")


def _unescaped(text):
    # Gherkin step strings carry literal \n sequences; turn them
    # into real newlines so markdown blocks can be expressed.
    return text.replace("\\n", "\n")


@given(parsers.parse('stdin is a pipe containing "{text}"'))
def given_stdin(ctx, text):
    ctx.stdin = _unescaped(text)


@given(parsers.parse('a file "{name}" containing "{text}"'))
def given_file(ctx, name, text):
    path = ctx.env.cwd_dir / name
    path.write_text(_unescaped(text))
    ctx.files = getattr(ctx, "files", []) + [name]


@when(parsers.parse('slackcopy runs with "{text}"'))
def step_run_text(ctx, text):
    # markdown travels via stdin; positional slackcopy args are file paths
    ctx.proc = ctx.env.run("slackcopy", stdin=_unescaped(text))


@when("slackcopy runs with no arguments")
def step_run_noargs(ctx):
    ctx.proc = ctx.env.run("slackcopy", stdin=getattr(ctx, "stdin", ""))


@when("slackcopy runs with no arguments and no stdin")
def step_run_empty(ctx):
    ctx.proc = ctx.env.run("slackcopy", stdin="")


@when(parsers.parse('slackcopy runs with the file "{name}"'))
def step_run_file(ctx, name):
    ctx.proc = ctx.env.run("slackcopy", name)


@when(parsers.parse('slackcopy runs with the files "{first}" "{second}"'))
def step_run_files(ctx, first, second):
    ctx.proc = ctx.env.run("slackcopy", first, second)


@when(parsers.parse('slackcopy runs with "{text}" and --stdout'))
def step_run_stdout(ctx, text):
    ctx.proc = ctx.env.run("slackcopy", "--stdout", stdin=_unescaped(text))


@when(parsers.parse('slackcopy runs with "{text}" and --plain'))
def step_run_plain(ctx, text):
    ctx.proc = ctx.env.run("slackcopy", "--plain", stdin=_unescaped(text))


def _osa_log(ctx):
    path = Path(ctx.env.state_dir / "osascript.log")
    assert path.exists(), "osascript was not invoked"
    return path


@then(parsers.parse('the osascript script sets a plain flavor containing "{text}"'))
def step_plain_flavor(ctx, text):
    script = _osa_log(ctx).read_text()
    assert "$.NSPasteboardTypeString" in script
    assert _unescaped(text) in script, script


@then(parsers.parse("the osascript script sets an HTML flavor containing {fragments}"))
def step_html_flavor(ctx, fragments):
    script = _osa_log(ctx).read_text()
    assert "$.NSPasteboardTypeHTML" in script
    # fragments is a '"x" and "y"' chain; fragments cannot contain quotes
    for fragment in fragments.split('" and "'):
        assert _unescaped(fragment.strip('"')) in script, script


@then("osascript is not called")
def step_osa_not_called(ctx):
    assert not (Path(ctx.env.state_dir) / "osascript.log").exists()


@then("pbcopy is not called")
def step_clip_not_called(ctx):
    assert not (ctx.env.state_dir / "pbcopy.log").exists()


@then(parsers.parse('pbcopy receives "{text}"'))
def step_clip(ctx, text):
    clip = Path(ctx.env.state_dir / "clip.txt")
    assert clip.read_text() == _unescaped(text)


@then(parsers.parse('the output is exactly "{expected}"'))
def step_exact_output(ctx, expected):
    assert ctx.proc.stdout == _unescaped(expected)


@then("the osascript script carries the table as a numbered list in both flavors")
def step_table_list(ctx):
    script = _osa_log(ctx).read_text()
    # Slack's html paste importer cannot build native tables (verified with
    # real Excel/Numbers shapes), so tables render as numbered lists in both
    # flavors: "1. *a:* 1 — *b:* 2" plain, <ol><li>…<b>a</b>: 1 — </li></ol> html.
    assert "1. *a:* 1 — *b:* 2" in script, script
    assert "<ol>" in script and "<b>a</b>" in script, script
    assert "\t" not in script, script
    assert "$.NSPasteboardTypeString" in script and "$.NSPasteboardTypeHTML" in script


@then("the output confirms the copy")
def step_confirm(ctx):
    assert "Copied to clipboard:" in ctx.proc.stdout


@then("the output tells the user to install pbcopy")
def step_install_hint(ctx):
    assert "You must have the 'pbcopy' program installed." in ctx.proc.stderr


@then("the output mentions the rich clipboard failure")
def step_rich_failure(ctx):
    assert "Failed to set rich clipboard" in ctx.proc.stderr


@then("the output shows the usage lines")
def step_usage(ctx):
    assert "Converts GitHub markdown to Slack formatting and copies it to the clipboard." in ctx.proc.stdout
    assert "Usage: slackcopy [--stdout] [--plain] [file...]" in ctx.proc.stdout