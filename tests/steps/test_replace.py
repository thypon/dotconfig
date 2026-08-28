from pathlib import Path

from pytest_bdd import given, parsers, scenarios, then, when

scenarios("../features/bin/replace.feature")

SED_HELPER = r'''
import re
import sys

INNER_OLD = r"s/\([[\/.*]\|\]\)/\\&/g"
INNER_NEW = r"s/[\/&]/\\&/g"


def _escape_set(data, chars):
    return "".join("\\" + c if c in chars else c for c in data)


def _pattern_to_regex(pattern):
    out = []
    i = 0
    while i < len(pattern):
        c = pattern[i]
        if c == "\\" and i + 1 < len(pattern):
            out.append(re.escape(pattern[i + 1]))
            i += 2
        else:
            out.append(re.escape(c))
            i += 1
    return "".join(out)


def _repl_from(replacement):
    def repl(match):
        out = []
        j = 0
        while j < len(replacement):
            c = replacement[j]
            if c == "\\" and j + 1 < len(replacement):
                out.append(replacement[j + 1])
                j += 2
            elif c == "&":
                out.append(match.group(0))
                j += 1
            else:
                out.append(c)
                j += 1
        return "".join(out)
    return repl


def apply_s(script, data):
    if script == INNER_OLD:
        return _escape_set(data, set("[/.*]"))
    if script == INNER_NEW:
        return _escape_set(data, set("/&"))
    if script.startswith("s"):
        delim = script[1]
        parts = []
        cur = ""
        i = 2
        while i < len(script):
            c = script[i]
            if c == "\\" and i + 1 < len(script):
                cur += script[i:i + 2]
                i += 2
                continue
            if c == delim:
                parts.append(cur)
                cur = ""
                i += 1
                continue
            cur += c
            i += 1
        parts.append(cur)
        pattern, replacement = parts[0], parts[1]
        flags = parts[2] if len(parts) > 2 else ""
        count = 0 if "g" in flags else 1
        return re.sub(_pattern_to_regex(pattern), _repl_from(replacement), data, count=count)
    sys.stderr.write("unsupported sed script: %r\n" % (script,))
    sys.exit(2)


def main():
    args = sys.argv[1:]
    if args and args[0] == "-i":
        script = args[1]
        for path in args[2:]:
            with open(path) as fh:
                data = fh.read()
            with open(path, "w") as fh:
                fh.write(apply_s(script, data))
    elif args and args[0] == "-e":
        sys.stdout.write(apply_s(args[1], sys.stdin.read()))
    else:
        sys.stderr.write("unsupported sed invocation: %r\n" % (args,))
        sys.exit(2)


if __name__ == "__main__":
    main()
'''


def _ensure_setup(ctx):
    if getattr(ctx, "replace_ready", False):
        return
    helper = ctx.env.state_dir / "sed_helper.py"
    helper.write_text(SED_HELPER.strip() + "\n")
    ctx.env.shim("sed", 'exec /usr/bin/python3 "%s" "$@"' % helper)
    ctx.replace_ready = True


@given(parsers.parse('a file with "{content}"'))
def given_file(ctx, content):
    _ensure_setup(ctx)
    ctx.target = ctx.env.cwd_dir / "target.txt"
    ctx.target.write_text(content)


@when(parsers.parse('replace runs with "{old}" and "{new}" on that file'))
def step_run(ctx, old, new):
    ctx.proc = ctx.env.run("replace", old, new, str(ctx.target))


@then(parsers.re(r'the file contains "(?P<expected>[^"]*)"'))
def then_contains(ctx, expected):
    assert expected in Path(ctx.target).read_text()


@then(parsers.re(r'the file contains "(?P<expected>[^"]*)" and not "(?P<forbidden>[^"]*)"'))
def then_contains_not(ctx, expected, forbidden):
    content = Path(ctx.target).read_text()
    assert expected in content
    assert forbidden not in content
