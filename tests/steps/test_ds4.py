import os
from pytest_bdd import given, parsers, scenarios, then, when

scenarios("../features/bin/ds4.feature")

LAUNCHCTL_SHIM = """
echo "launchctl $*" >> "$LAUNCHCTL_LOG"
case "$1" in
  print)
    case "$LAUNCHCTL_MODE" in
      running) printf '\\tpid = 4242\\n\\tstate = running\\n'; exit 0 ;;
      stopped) printf '\\tstate = not running\\n\\tlast exit code = 1\\n'; exit 0 ;;
      *) exit 1 ;;
    esac ;;
esac
exit 0
"""

CURL_SHIM = """
if [ -n "$CURL_BODY" ]; then
  printf '%s\\n' "$CURL_BODY"
  exit 0
fi
exit 1
"""

TAIL_SHIM = """
echo "tail $*" >> "$TAIL_LOG"
"""

PLIST_BODY = """<?xml version="1.0"?><plist/>"""
CURL_BODY = '{"object":"list","data":[{"id":"glm-5.3-flash","owned_by":"ds4.c"}]}'

MODES = {"running": "running", "stopped": "stopped", "unloaded": "unloaded"}


@given(parsers.parse('the ds4 service is controlled via DS4_DOMAIN {domain}'))
def given_domain(ctx, domain):
    ctx.domain = domain


@given(parsers.parse('launchctl reports the agent as {state}'))
def given_launchctl_state(ctx, state):
    ctx.mode = MODES[state]


@given('the API answers with a model list')
def given_api_up(ctx):
    ctx.curl_body = CURL_BODY


@given('the ds4 log file exists')
def given_log_file(ctx):
    ctx.log_file = ctx.env.home / ".ds4" / "server.log"
    ctx.log_file.parent.mkdir(parents=True)
    ctx.log_file.write_text("startup line\n")


@when(parsers.parse('ds4 runs with "{args}"'))
def when_ds4_runs(ctx, args):
    _run_ds4(ctx, *args.split())


@when('ds4 runs with no arguments')
def when_ds4_runs_noargs(ctx):
    _run_ds4(ctx)


def _run_ds4(ctx, *args):
    log_file = ctx.log_file if hasattr(ctx, "log_file") else ctx.env.home / ".ds4" / "server.log"
    plist = ctx.env.home / "Library" / "LaunchAgents" / "com.dwarfstar.ds4-server.plist"
    plist.parent.mkdir(parents=True, exist_ok=True)
    plist.write_text(PLIST_BODY)
    ctx.launchctl_log = ctx.env.state_dir / "launchctl.log"
    ctx.tail_log = ctx.env.state_dir / "tail.log"
    ctx.env.shim("launchctl", LAUNCHCTL_SHIM)
    ctx.env.shim("curl", CURL_SHIM)
    ctx.env.shim("tail", TAIL_SHIM)
    extra = {
        "DS4_DOMAIN": ctx.domain,
        "DS4_PLIST": str(plist),
        "DS4_LOG": str(log_file),
        "LAUNCHCTL_LOG": str(ctx.launchctl_log),
        "TAIL_LOG": str(ctx.tail_log),
        "LAUNCHCTL_MODE": getattr(ctx, "mode", "unloaded"),
    }
    if getattr(ctx, "curl_body", None):
        extra["CURL_BODY"] = ctx.curl_body
    ctx.env.set_env(**extra)
    ctx.proc = ctx.env.run("ds4", *args)


def launchctl_calls(ctx):
    if not ctx.launchctl_log.exists():
        return []
    return ctx.launchctl_log.read_text().splitlines()


@then(parsers.parse('launchctl bootstraps {target} from the plist'))
def then_bootstrap(ctx, target):
    domain = target.rsplit("/", 1)[0]
    calls = [line for line in launchctl_calls(ctx) if " bootstrap " in line]
    assert len(calls) == 1, calls
    assert calls[0].startswith(f"launchctl bootstrap {domain} "), calls


@then(parsers.parse('launchctl is not called with bootstrap'))
def then_no_bootstrap(ctx):
    assert not any("bootstrap" in line for line in launchctl_calls(ctx))


@then(parsers.parse('launchctl kickstarts {target}'))
def then_kickstart(ctx, target):
    calls = launchctl_calls(ctx)
    assert any(
        line.startswith(f"launchctl kickstart {target}")
        or line.startswith(f"launchctl kickstart -k {target}")
        for line in calls
    ), calls


@then(parsers.parse('launchctl boots out {target}'))
def then_bootout(ctx, target):
    calls = launchctl_calls(ctx)
    assert f"launchctl bootout {target}" in calls, calls


@then('the output reports running state and a served model')
def then_status_output(ctx):
    out = ctx.proc.stdout + ctx.proc.stderr
    assert "state = running" in out
    assert "serving glm-5.3-flash" in out


@then(parsers.parse('tail follows the ds4 log file'))
def then_tail_follows(ctx):
    lines = ctx.tail_log.read_text().splitlines()
    assert len(lines) == 1, lines
    assert lines[0].startswith("tail -n 50 -f "), lines
    assert lines[0].endswith("server.log")
