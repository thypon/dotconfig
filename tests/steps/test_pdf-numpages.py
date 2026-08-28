from pathlib import Path

from pytest_bdd import given, parsers, scenarios, then, when

scenarios("../features/bin/pdf-numpages.feature")

FIND_SHIM = """
pats=""
while [ $# -gt 0 ]; do
  case "$1" in
    -iname) pats="$pats $2"; shift 2 ;;
    *) shift ;;
  esac
done
walk() {
  for f in "$1"/*; do
    [ -e "$f" ] || continue
    base=${f##*/}
    for p in $pats; do
      case "$base" in
        $p)
          echo "$f"
          break
          ;;
      esac
    done
    if [ -d "$f" ]; then
      walk "$f"
    fi
  done
}
walk .
"""

PDFTK_SHIM = """
[ "$2" = "dump_data" ] || exit 1
awk -v f="${1#./}" '$1==f {print "NumberOfPages: " $2; exit}' "$PDF_PAGES_MAP"
"""


@given("PDFs doc1.pdf with 3 pages and doc2.pdf with 5 pages")
def given_pdfs(ctx):
    cwd = Path(ctx.env.cwd_dir)
    (cwd / "doc1.pdf").write_bytes(b"%PDF-1.4\n")
    (cwd / "doc2.pdf").write_bytes(b"%PDF-1.4\n")
    ctx.env.set_env(PDF_PAGES_MAP=str(ctx.env.state_dir / "pdf-pages.map"))
    (ctx.env.state_dir / "pdf-pages.map").write_text("doc1.pdf 3\ndoc2.pdf 5\n")
    ctx.env.shim("find", FIND_SHIM)
    ctx.env.shim("pdftk", PDFTK_SHIM)


@when("pdf-numpages runs")
def step_run(ctx):
    ctx.proc = ctx.env.run("pdf-numpages")


@then(parsers.parse("{name} shows NumberOfPages {count}"))
def step_shows_pages(ctx, name, count):
    assert f"NumberOfPages: {count}" in ctx.proc.stdout.splitlines()


@then(parsers.parse('the output ends with "{suffix}"'))
def step_ends_with(ctx, suffix):
    assert ctx.proc.stdout.rstrip().endswith(suffix)