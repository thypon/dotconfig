from pathlib import Path

from pytest_bdd import parsers, scenarios, then, when

scenarios("../features/bin/denoise.feature")

FFMPEG_SHIM = """
echo "ffmpeg $*" >> "$FFMPEG_LOG"
last=""
for a in "$@"; do last=$a; done
: > "$last"
"""


def ffmpeg_log(ctx):
    log = Path(ctx.env.state_dir) / "ffmpeg.log"
    return log.read_text().splitlines() if log.exists() else []


@when(parsers.parse('denoise runs with "{input}" and "{output}"'))
def when_run(ctx, input, output):
    ctx.env.set_env(FFMPEG_LOG=str(ctx.env.state_dir / "ffmpeg.log"))
    ctx.env.shim("ffmpeg", FFMPEG_SHIM)
    ctx.proc = ctx.env.run("denoise", input, output)


@then(parsers.parse("ffmpeg is invoked with {filter}"))
def then_filter(ctx, filter):
    assert any(filter in line for line in ffmpeg_log(ctx))


@then("libx264 crf 24 preset slow is used for video")
def then_video(ctx):
    line = "\n".join(ffmpeg_log(ctx))
    assert "-vcodec libx264" in line
    assert "-crf 24" in line
    assert "-preset slow" in line


@then("aac 192k is used for audio")
def then_audio(ctx):
    line = "\n".join(ffmpeg_log(ctx))
    assert "-acodec aac" in line
    assert "-ab 192k" in line


@then(parsers.parse("ffmpeg writes to {output}"))
def then_output(ctx, output):
    lines = ffmpeg_log(ctx)
    assert lines
    assert lines[-1].split()[-1] == output
    assert (ctx.env.cwd_dir / output).exists()
