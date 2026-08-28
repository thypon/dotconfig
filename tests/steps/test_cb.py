from pathlib import Path

from pytest_bdd import given, parsers, scenarios, then, when

scenarios("../features/bin/cb.feature")

XCLIP_SHIM = """
cat > "$CB_CLIP_FILE"
printf '%s\\n' "$@" >> "$CB_ARGS_LOG"
"""


@given("xclip is available")
def given_xclip(ctx):
    ctx.env.set_env(
        CB_CLIP_FILE=str(ctx.env.state_dir / "clip.txt"),
        CB_ARGS_LOG=str(ctx.env.state_dir / "xclip-args.log"),
    )
    ctx.env.shim("xclip", XCLIP_SHIM)


@given("xclip is not on PATH")
def given_no_xclip(ctx):
    # shims-only PATH: the host may ship a real xclip in /usr/bin
    ctx.env.set_env(PATH=str(ctx.env.bin_dir))


@given("the effective user is root")
def given_root(ctx):
    ctx.env.set_env(USER="root")


@given(parsers.parse('stdin is a pipe containing "{text}"'))
def given_stdin(ctx, text):
    ctx.stdin = text


@when(parsers.parse('cb runs with "{text}"'))
def step_run(ctx, text):
    ctx.proc = ctx.env.run("cb", text, stdin=getattr(ctx, "stdin", ""))


@when("cb runs with no arguments")
def step_run_noargs(ctx):
    ctx.proc = ctx.env.run("cb", stdin=getattr(ctx, "stdin", ""))


@when("cb runs with no arguments and no stdin")
def step_run_empty(ctx):
    ctx.proc = ctx.env.run("cb", stdin="")


@when("cb runs with a 100-character string")
def step_run_long(ctx):
    ctx.long_text = "x" * 100
    ctx.proc = ctx.env.run("cb", ctx.long_text)


@then(parsers.parse('xclip receives "{text}" on selection c'))
def step_clip(ctx, text):
    clip = Path(ctx.env.state_dir / "clip.txt")
    assert clip.read_text() == text
    args_log = Path(ctx.env.state_dir / "xclip-args.log")
    assert args_log.read_text().split() == ["-selection", "c"]


@then("xclip is not called")
def step_clip_not_called(ctx):
    args_log = Path(ctx.env.state_dir / "xclip-args.log")
    assert not args_log.exists()


@then("the output confirms the copy")
def step_confirm(ctx):
    assert "Copied to clipboard:" in ctx.proc.stdout


@then("the output tells the user to install xclip")
def step_install_hint(ctx):
    assert "You must have the 'xclip' program installed." in ctx.proc.stderr


@then("the output explains a regular user is required")
def step_regular_user(ctx):
    assert "Must be regular user (not root)" in ctx.proc.stderr


@then("the output shows the usage lines")
def step_usage(ctx):
    assert "Copies a string to the clipboard." in ctx.proc.stdout
    assert "Usage: cb <string>" in ctx.proc.stdout


@then("xclip receives the full 100-character string")
def step_clip_full(ctx):
    clip = Path(ctx.env.state_dir / "clip.txt")
    assert clip.read_text() == ctx.long_text


@then('the echo shows only the first 80 characters followed by "..."')
def step_echo_truncated(ctx):
    out = ctx.proc.stdout
    assert "x" * 80 in out
    assert "x" * 81 not in out
    assert "..." in out
