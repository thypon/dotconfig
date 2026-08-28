from pathlib import Path

from pytest_bdd import given, parsers, scenarios, then, when

scenarios("../features/bin/chromecastize.feature")

MEDIAINFO_SHIM = """
echo "mediainfo $*" >> "$MEDIAINFO_LOG"
inform=${1#--Inform=}
section=${inform%%;*}
rest=${inform#*;}
rest=${rest#%}
name=${rest%%%*}
state="$MEDIAINFO_STATE/$(basename "$2")"
case "$section:$name" in
  General:Format) sed -n 1p "$state" ;;
  Video:Format) sed -n 2p "$state" ;;
  Audio:Format) sed -n 3p "$state" ;;
  General:Duration/String3) echo "00:00:10.000" ;;
esac
"""

FFMPEG_SHIM = """
echo "ffmpeg $*" >> "$FFMPEG_LOG"
last=""
for a in "$@"; do last=$a; done
: > "$last"
if [ -n "$FAKE_FFMPEG_FAIL" ]; then
  exit 1
fi
"""

REALPATH_SHIM = """
echo "realpath $*" >> "$REALPATH_LOG"
case "$1" in
  /*) printf '%s\\n' "$1" ;;
  *) printf '%s\\n' "$PWD/$1" ;;
esac
"""

# mediainfo reports these container/audio names differently from common usage
GFORMAT_MAP = {"MP4": "MPEG-4"}
ACODEC_MAP = {"AC-3": "AC-3"}


def set_media(ctx, name, gformat, vcodec, acodec):
    state = Path(ctx.env.state_dir) / "mediainfo" / name
    state.parent.mkdir(parents=True, exist_ok=True)
    state.write_text(f"{gformat}\n{vcodec}\n{acodec}\n")


def processed_file(ctx):
    return Path(ctx.env.home) / ".chromecastize" / "processed_files"


def ffmpeg_log(ctx):
    log = Path(ctx.env.state_dir) / "ffmpeg.log"
    return log.read_text().splitlines() if log.exists() else []


def expected_realpath(ctx, name):
    return str(Path(ctx.env.cwd_dir) / name)


@given("mediainfo, ffmpeg and realpath are available")
def given_tools(ctx):
    ctx.env.set_env(
        MEDIAINFO_LOG=str(ctx.env.state_dir / "mediainfo.log"),
        MEDIAINFO_STATE=str(ctx.env.state_dir / "mediainfo"),
        FFMPEG_LOG=str(ctx.env.state_dir / "ffmpeg.log"),
        REALPATH_LOG=str(ctx.env.state_dir / "realpath.log"),
        PWD=str(ctx.env.cwd_dir),
    )
    ctx.env.shim("mediainfo", MEDIAINFO_SHIM)
    ctx.env.shim("ffmpeg", FFMPEG_SHIM)
    ctx.env.shim("realpath", REALPATH_SHIM)


@given("mediainfo is not installed")
def given_no_mediainfo(ctx):
    (ctx.env.bin_dir / "mediainfo").unlink()
    # shims-only PATH: the host may ship a real mediainfo in /usr/bin
    ctx.env.set_env(PATH=str(ctx.env.bin_dir))


@given("neither ffmpeg nor avconv is installed")
def given_no_ffmpeg(ctx):
    (ctx.env.bin_dir / "ffmpeg").unlink()
    ctx.env.set_env(PATH=str(ctx.env.bin_dir))


@given(
    parsers.re(
        r"a file (?P<name>\S+) with (?P<gformat>\S+) container,"
        r" (?P<vcodec>[^,]+?) video and (?P<acodec>[^,]+?) audio"
    )
)
def given_video_file(ctx, name, gformat, vcodec, acodec):
    (ctx.env.cwd_dir / name).write_text("")
    set_media(ctx, Path(name).name, GFORMAT_MAP.get(gformat, gformat), vcodec, acodec)


@given(parsers.re(r"a file (?P<name>\S+) with supported codecs inside (?P<gformat>\S+)"))
def given_supported_file(ctx, name, gformat):
    (ctx.env.cwd_dir / name).write_text("")
    gformat = GFORMAT_MAP.get(gformat, gformat)
    set_media(ctx, name, gformat, "AVC", "AAC")


@given(parsers.re(r"a file (?P<name>\S+) that fails ffmpeg conversion"))
def given_failing_file(ctx, name):
    (ctx.env.cwd_dir / name).write_text("")
    set_media(ctx, Path(name).name, "AVI", "MPEG-4 Visual", "AC-3")
    ctx.env.set_env(FAKE_FFMPEG_FAIL="1")


@given(parsers.re(r"processed_files contains the realpath of (?P<name>\S+)"))
def given_processed(ctx, name):
    pf = processed_file(ctx)
    pf.parent.mkdir(parents=True, exist_ok=True)
    with pf.open("a") as fh:
        fh.write(expected_realpath(ctx, name) + "\n")


@given(parsers.re(r"a directory (?P<dir>\S+) containing two supported videos"))
def given_video_dir(ctx, dir):
    d = ctx.env.cwd_dir / dir
    d.mkdir()
    for base in ("a.mkv", "b.mkv"):
        (d / base).write_text("")
        set_media(ctx, base, "Matroska", "AVC", "AAC")


@when(parsers.re(r'chromecastize runs with "(?P<file>[^"]+)"'))
def when_run_file(ctx, file):
    p = ctx.env.cwd_dir / file
    if not p.exists():
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text("")
    ctx.proc = ctx.env.run("chromecastize", file)


@when("chromecastize runs with no arguments")
def when_run_noargs(ctx):
    ctx.proc = ctx.env.run("chromecastize")


@when(parsers.parse('chromecastize runs with "{flag}" and "{file}"'))
def when_run_flag(ctx, flag, file):
    p = ctx.env.cwd_dir / file
    if not p.exists():
        p.write_text("")
    ctx.proc = ctx.env.run("chromecastize", flag, file)


@then("the output says mediainfo is not available")
def then_mediainfo_missing_msg(ctx):
    assert "`mediainfo` is not available" in ctx.proc.stdout


@then("the chromecastize usage line is printed")
def then_usage(ctx):
    assert "Usage: chromecastize.sh" in ctx.proc.stdout


@then("ffmpeg is not invoked")
def then_ffmpeg_not_invoked(ctx):
    assert ffmpeg_log(ctx) == []


@then("the output says it is not a video format")
def then_not_video(ctx):
    assert "not a video format" in ctx.proc.stdout


@then(
    parsers.re(
        r"ffmpeg is invoked producing (?P<output>\S+)"
        r" with (?P<vcodec>\S+) video and (?P<acodec>\S+) audio"
    )
)
def then_ffmpeg_produced(ctx, output, vcodec, acodec):
    lines = ffmpeg_log(ctx)
    assert lines
    line = lines[-1]
    assert f"-vcodec {vcodec}" in line
    assert f"-acodec {acodec}" in line
    assert line.split()[-1] == output
    assert (ctx.env.cwd_dir / output).exists()


@then(parsers.re(r"ffmpeg is invoked writing (?P<output>\S+)"))
def then_ffmpeg_writing(ctx, output):
    lines = ffmpeg_log(ctx)
    assert lines
    assert lines[-1].split()[-1] == output
    assert (ctx.env.cwd_dir / output).exists()


@then(parsers.re(r"(?P<name>\S+) is recorded in the processed_files list"))
def then_recorded(ctx, name):
    lines = processed_file(ctx).read_text().splitlines()
    assert expected_realpath(ctx, name) in lines


@then(parsers.re(r"(?P<old>\S+) is renamed to (?P<new>\S+)"))
def then_renamed(ctx, old, new):
    assert not (ctx.env.cwd_dir / old).exists()
    assert (ctx.env.cwd_dir / new).exists()


@then(parsers.re(r"(?P<name>\S+) is not renamed"))
def then_not_renamed(ctx, name):
    assert (ctx.env.cwd_dir / name).exists()


@then(parsers.re(r"the partial (?P<name>\S+) is deleted"))
def then_partial_deleted(ctx, name):
    assert not (ctx.env.cwd_dir / name).exists()


@then("both videos are processed")
def then_both_processed(ctx):
    lines = processed_file(ctx).read_text().splitlines()
    for base in ("a.mkv", "b.mkv"):
        assert expected_realpath(ctx, "vids/" + base) in lines
    assert ffmpeg_log(ctx) == []
