"""Helpers shared by gh wrapper script test modules."""

JQ_CODE = '''import sys, json

args = sys.argv[1:]
raw = compact = False
prog = None
for a in args:
    if a == "-r":
        raw = True
    elif a == "-c":
        compact = True
    else:
        prog = a

def stream(text):
    dec = json.JSONDecoder()
    i, out = 0, []
    while i < len(text):
        while i < len(text) and text[i] in " \\t\\r\\n":
            i += 1
        if i >= len(text):
            break
        val, i = dec.raw_decode(text, i)
        out.append(val)
    return out

vals = stream(sys.stdin.read())
if prog is None:
    for v in vals:
        print(json.dumps(v, indent=2))
    sys.exit(0)

iterate = prog.strip().endswith("[]")
key = prog.strip()
if iterate:
    key = key[:-2]
node = vals[0] if vals else None
key = key.strip(".")
if key:
    for part in key.split("."):
        node = node.get(part) if isinstance(node, dict) else None

def emit(v):
    if raw and isinstance(v, str):
        sys.stdout.write(v + "\\n")
    elif compact:
        print(json.dumps(v, separators=(",", ":")))
    else:
        print(json.dumps(v, indent=2))

if iterate:
    for item in (node or []):
        emit(item)
else:
    emit(node)
'''

JQ_SHIM = 'exec /usr/bin/python3 "$JQ_CODE_FILE" "$@"'


def install_jq(ctx):
    if getattr(ctx, "jq_ready", False):
        return
    helper = ctx.env.state_dir / "jq_helper.py"
    helper.write_text(JQ_CODE)
    ctx.env.shim("jq", JQ_SHIM)
    ctx.env.set_env(JQ_CODE_FILE=str(helper))
    ctx.jq_ready = True
