import pytest
from pytest_bdd import given, parsers, scenarios, then, when

scenarios("../features/bin/subtle-session.feature")

# subtle-session picks its TERM from these absolute paths; none exist on
# the test host unless a port leaked into /usr/bin.
TERM_PATHS = [
    "/usr/bin/alacritty",
    "/usr/bin/xterm",
    "/usr/bin/st",
    "/usr/bin/terminology",
    "/usr/bin/urxvt",
]

BYOBU_SHIM = """#!/bin/sh
echo "byobu $*" >> "$BYOBU_LOG"
"""


def subtlext_lib(count):
    clients = ", ".join(
        f'new("{name}")' for name in (["Alacritty", "xterm"][:count])
    )
    return (
        "module Subtlext\n"
        "  class Client\n"
        "    attr_reader :instance\n"
        "    def initialize(instance)\n"
        "      @instance = instance\n"
        "    end\n"
        "    def self.all\n"
        f"      @all ||= [{clients}]\n"
        "    end\n"
        "  end\n"
        "end\n"
    )


@given(parsers.parse("a fake subtlext ruby library with {count:d} clients"))
def fake_subtlext(ctx, count):
    for path in TERM_PATHS:
        if __import__("os").path.exists(path):
            pytest.skip(f"{path} exists on this host")
    libdir = ctx.env.state_dir / "rubylib"
    (libdir / "subtle").mkdir(parents=True, exist_ok=True)
    (libdir / "subtle" / "subtlext.rb").write_text(subtlext_lib(count))
    ctx.env.set_env(RUBYLIB=str(libdir))


@given(parsers.parse('the terminal emulator is "{term}"'))
def terminal_emulator(ctx, term):
    ctx.env.set_env(SUBTLE_SESSION_TERM=term)


@given("a byobu command shim")
def byobu_shim(ctx):
    ctx.byobu_log = ctx.env.state_dir / "byobu.log"
    ctx.env.shim("byobu", BYOBU_SHIM)
    ctx.env.set_env(BYOBU_LOG=str(ctx.byobu_log))


@when("subtle-session runs")
def subtle_session_runs(ctx):
    ctx.proc = ctx.env.run("subtle-session")


@then(parsers.parse('byobu was invoked with session "{session}"'))
def byobu_invoked(ctx, session):
    assert ctx.byobu_log.exists(), ctx.proc.stderr
    expected = f"byobu new-session -A -s {session}"
    assert ctx.byobu_log.read_text().splitlines() == [expected]