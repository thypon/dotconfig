import os
from pathlib import Path

from pytest_bdd import given, parsers, scenarios, then, when

scenarios("../features/bin/cbf.feature")

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
REAL_CB = os.path.join(REPO_ROOT, "common", ".local", "bin", "cb")

XCLIP_SHIM = """
cat > "$CB_CLIP_FILE"
printf '%s\\n' "$@" >> "$CB_ARGS_LOG"
"""


def _ensure_setup(ctx):
    if getattr(ctx, "cbf_ready", False):
        return
    ctx.env.shim("cb", 'exec "%s" "$@"' % REAL_CB)
    ctx.env.shim("xclip", XCLIP_SHIM)
    ctx.env.set_env(
        CB_CLIP_FILE=str(ctx.env.state_dir / "clip.txt"),
        CB_ARGS_LOG=str(ctx.env.state_dir / "xclip-args.log"),
    )
    ctx.cbf_ready = True


def _clip_file(ctx):
    return Path(ctx.env.state_dir / "clip.txt")


@given(parsers.parse('a file {fname} containing "{text}"'))
def given_file(ctx, fname, text):
    _ensure_setup(ctx)
    (ctx.env.cwd_dir / fname).write_text(text)


@given(parsers.parse("no file {fname} exists"))
def given_no_file(ctx, fname):
    _ensure_setup(ctx)
    assert not (ctx.env.cwd_dir / fname).exists()


@when(parsers.parse("cbf runs with {fname}"))
def step_run(ctx, fname):
    ctx.proc = ctx.env.run("cbf", fname)


@then(parsers.parse('the clipboard contains "{text}" on selection c'))
def then_clip(ctx, text):
    assert _clip_file(ctx).read_text() == text
    args_log = Path(ctx.env.state_dir / "xclip-args.log")
    assert args_log.read_text().split() == ["-selection", "c"]


@then("the clipboard is untouched")
def then_no_clip(ctx):
    assert not _clip_file(ctx).exists()
    assert not Path(ctx.env.state_dir / "xclip-args.log").exists()
