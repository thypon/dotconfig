import re

from pytest_bdd import given, parsers, scenarios, then, when

scenarios("../features/bin/youtubelinks.feature")

YOUTUBE_ID = "SHORTID99XY"
URL_RE = re.compile(r"https?://\S+")


@given(parsers.parse("a file with {text}"))
def step_file(ctx, text):
    urls = URL_RE.findall(text)
    if "one youtube link" in text:
        content = f"see {urls[0]} and https://youtu.be/{YOUTUBE_ID} here\n"
    else:
        content = f"see {urls[0]} and {urls[1]}\n"
    ctx.file = ctx.env.cwd_dir / "links.txt"
    ctx.file.write_text(content)


@when("youtubelinks runs with the file")
def step_run(ctx):
    ctx.proc = ctx.env.run("youtubelinks", str(ctx.file))


@then(parsers.parse('the output is "{text}"'))
def step_output(ctx, text):
    assert ctx.proc.stdout.strip() == text


@then("only the youtube ID is printed")
def step_only_youtube(ctx):
    assert ctx.proc.stdout.strip() == YOUTUBE_ID
    assert "vimeo" not in ctx.proc.stdout
