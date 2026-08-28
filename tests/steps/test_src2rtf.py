from pytest_bdd import parsers, scenarios, given, then, when

scenarios("../features/bin/src2rtf.feature")

PYGMENTIZE_SHIM = """
printf 'pygmentize %s\\n' "$*" >> "$PYGMENTIZE_LOG"
out=""
prev=""
for a in "$@"; do
  if [ "$prev" = "-o" ]; then
    out="$a"
  fi
  prev="$a"
done
printf '%s\\n' '{\\rtf1\\ansi FAKE-RTF}' > "$out"
"""


@given("a file notes.py")
def step_source_file(ctx):
    (ctx.env.cwd_dir / "notes.py").write_text('print("hello")\n')
    ctx.pygmentize_log = ctx.env.state_dir / "pygmentize.log"


@when(parsers.parse("src2rtf runs with {filename}"))
def step_run(ctx, filename):
    ctx.env.set_env(PYGMENTIZE_LOG=str(ctx.pygmentize_log))
    ctx.env.shim("pygmentize", PYGMENTIZE_SHIM)
    ctx.proc = ctx.env.run("src2rtf", filename)


@then("notes.rtf exists")
def step_rtf_exists(ctx):
    rtf = ctx.env.cwd_dir / "notes.rtf"
    assert rtf.exists()
    assert rtf.read_text().startswith("{\\rtf1")


@then("pygmentize used the rtf formatter with full options")
def step_pygmentize_args(ctx):
    tokens = ctx.pygmentize_log.read_text().split()
    assert tokens[0] == "pygmentize"
    for flag, value in [("-f", "rtf"), ("-O", "full"), ("-o", "notes.rtf")]:
        assert flag in tokens
        assert tokens[tokens.index(flag) + 1] == value
    assert "notes.py" in tokens
