from pathlib import Path

from pytest_bdd import given, scenarios, then, when

scenarios("../features/bin/pdfpages.feature")

PDFINFO_SHIM = """
[ -f "$1" ] || exit 1
pages=$(awk -v f="$1" '$1==f {print $2; exit}' "$PDFINFO_PAGES_MAP")
echo "Pages:          $pages"
"""

PASTE_SHIM = """
d=$(printf '\\t')
s=0
while getopts "d:s" opt; do
  case "$opt" in
    d) d=$OPTARG ;;
    s) s=1 ;;
  esac
done
shift $((OPTIND - 1))
if [ "$s" = 1 ]; then
  out=""
  n=0
  while IFS= read -r line; do
    if [ "$n" = 0 ]; then
      out="$line"
    else
      out="$out$d$line"
    fi
    n=$((n + 1))
  done
  if [ "$n" -gt 0 ]; then
    printf '%s\\n' "$out"
  fi
fi
"""


@given("PDFs a.pdf with 2 pages and b.pdf with 7 pages")
def given_pdfs(ctx):
    cwd = Path(ctx.env.cwd_dir)
    (cwd / "a.pdf").write_bytes(b"%PDF-1.4\n")
    (cwd / "b.pdf").write_bytes(b"%PDF-1.4\n")
    ctx.env.set_env(PDFINFO_PAGES_MAP=str(ctx.env.state_dir / "pdfinfo-pages.map"))
    (ctx.env.state_dir / "pdfinfo-pages.map").write_text("a.pdf 2\nb.pdf 7\n")
    ctx.env.shim("pdfinfo", PDFINFO_SHIM)
    ctx.env.shim("paste", PASTE_SHIM)


@given("no PDF files in the current directory")
def given_no_pdfs(ctx):
    ctx.env.set_env(PDFINFO_PAGES_MAP=str(ctx.env.state_dir / "pdfinfo-pages.map"))
    (ctx.env.state_dir / "pdfinfo-pages.map").write_text("")
    ctx.env.shim("pdfinfo", PDFINFO_SHIM)
    ctx.env.shim("paste", PASTE_SHIM)


@when("pdfpages runs")
def step_run(ctx):
    ctx.proc = ctx.env.run("pdfpages")


@then("the output is 9")
def step_sum(ctx):
    assert ctx.proc.stdout.strip() == "9"


@then("the script does not print a page sum")
def step_no_sum(ctx):
    assert ctx.proc.stdout.strip() == ""