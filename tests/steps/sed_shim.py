"""Minimal GNU-style sed shim for scripts that use `sed -i` (BSD sed cannot).

Covers exactly the forms used by xrevert and dmenu_path_reorder:
  /re/d          delete matching lines        [addr]d
  /re/i text     insert text before matches   [addr]i text
  1s;^;x\\n;     substitute on line 1         [addr]s<del>pat<del>repl<del>[flags]
with optional -i (in-place) and stdin->stdout for piped `sed 's|a|b|g'` use.
"""

SED_CODE = '''import sys, re

def _unescape(t):
    out = []
    j = 0
    while j < len(t):
        c = t[j]
        if c == "\\\\" and j + 1 < len(t):
            nxt = t[j + 1]
            out.append("\\n" if nxt == "n" else nxt)
            j += 2
        else:
            out.append(c)
            j += 1
    return "".join(out)

def main():
    args = sys.argv[1:]
    if args and args[0].startswith("-i"):
        args = args[1:]
    if not args:
        sys.exit(1)
    script = args[0]
    files = args[1:]

    i = 0
    addr = None
    if script[0].isdigit():
        j = 0
        while j < len(script) and script[j].isdigit():
            j += 1
        addr = ("num", int(script[:j]))
        i = j
    elif script[0] == "/":
        e = script.index("/", 1)
        addr = ("re", script[1:e])
        i = e + 1
    cmd = script[i]
    rest = script[i + 1:]
    if cmd == "s":
        delim = rest[0]
        parts = rest[1:].split(delim)
        pat, repl = parts[0], parts[1]
        flags = parts[2] if len(parts) > 2 else ""
        repl = repl.replace("\\\\n", "\\n")
        cre = re.compile(pat)
        count = 0 if "g" in flags else 1
    elif cmd in ("d", "i"):
        text = rest[1:] if rest.startswith(" ") else rest
        # GNU sed processes backslash escapes in i/a text (backslash-x -> x,
        # backslash-n -> newline); BSD keeps them literal, which breaks the
        # void scripts
        text = _unescape(text)
    else:
        sys.exit(1)

    def match(ln, n):
        if addr is None:
            return True
        kind, val = addr
        if kind == "num":
            return n == val
        return re.search(val, ln) is not None

    def transform(lines):
        out = []
        for n, ln in enumerate(lines, 1):
            if match(ln, n):
                if cmd == "d":
                    continue
                if cmd == "i":
                    out.append(text + "\\n")
                    out.append(ln)
                    continue
                out.append(cre.sub(repl, ln, count=count))
                continue
            out.append(ln)
        return out

    if files:
        for f in files:
            with open(f) as fh:
                lines = fh.readlines()
            with open(f, "w") as fh:
                fh.writelines(transform(lines))
    else:
        sys.stdout.writelines(transform(sys.stdin.readlines()))

main()
'''

SED_SHIM = 'exec /usr/bin/python3 "$SED_CODE_FILE" "$@"'


def install_sed(ctx):
    if getattr(ctx, "sed_ready", False):
        return
    helper = ctx.env.state_dir / "sed_helper.py"
    helper.write_text(SED_CODE)
    ctx.env.shim("sed", SED_SHIM)
    ctx.env.set_env(SED_CODE_FILE=str(helper))
    ctx.sed_ready = True