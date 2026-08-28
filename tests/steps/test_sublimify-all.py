from pytest_bdd import given, scenarios, then, when

scenarios("../features/bin/sublimify-all.feature")

LANGUAGES_YML = """\
Python:
  type: programming
  extensions:
    - .py
Ruby:
  type: scripting
  extensions:
    - .rb
Markdown:
  type: prose
  extensions:
    - .md
"""

CURL_SHIM = 'cat "$LANGUAGES_YML"'

YQ_SHIM = """
awk '
  /^[A-Za-z][A-Za-z0-9 _-]*:/ { in_ext = 0 }
  /^  extensions:/ { in_ext = 1; next }
  in_ext && $1 == "-" { print $2 }
' | awk '!seen[$0]++'
"""

DUTI_SHIM = 'echo "duti $*" >> "$DUTI_LOG"'


@given("a linguist languages.yml with extensions py, rb and md")
def given_languages_yml(ctx):
    yml = ctx.env.state_dir / "languages.yml"
    yml.write_text(LANGUAGES_YML)
    ctx.duti_log = ctx.env.state_dir / "duti.log"
    ctx.env.shim("curl", CURL_SHIM)
    ctx.env.shim("yq", YQ_SHIM)
    ctx.env.shim("duti", DUTI_SHIM)
    ctx.env.set_env(LANGUAGES_YML=str(yml), DUTI_LOG=str(ctx.duti_log))


@when("sublimify-all runs")
def when_sublimify_all_runs(ctx):
    ctx.proc = ctx.env.run("sublimify-all")


@then("duti -s com.sublimetext.4 runs for py, rb and md with role all")
def then_duti_calls(ctx):
    lines = ctx.duti_log.read_text().splitlines()
    assert lines == [
        "duti -s com.sublimetext.4 .py all",
        "duti -s com.sublimetext.4 .rb all",
        "duti -s com.sublimetext.4 .md all",
    ]
