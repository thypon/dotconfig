from pathlib import Path

from pytest_bdd import given, scenarios, then, when

scenarios("../features/bin/akernel.feature")

DTC_SHIM = """
echo "dtc $*" >> "$DTC_LOG"
out=""
src=""
while [ $# -gt 0 ]; do
  case "$1" in
    -p|-O) shift 2 ;;
    -o) out="$2"; shift 2 ;;
    *) src="$1"; shift ;;
  esac
done
printf 'DTB(%s)\\n' "$(basename "$src")" > "$out"
"""

PYTHON_SHIM = """
echo "python $*" >> "$PYTHON_LOG"
for arg in "$@"; do
  case "$arg" in
    *droidtools*) printf 'BUILT-OUT-IMG\\n' > out.img ;;
  esac
done
"""

MKTEMP_SHIM = """
echo "mktemp $*" >> "$MKTEMP_LOG"
/usr/bin/mktemp -d "$MKTEMP_ROOT/tmp.XXXXXXXXXX"
"""


def _clean_tmp():
    for name in ("zImage.tmp", "file.dtb", "zImage"):
        Path("/tmp", name).unlink(missing_ok=True)


def _make_tree(ctx):
    cwd = ctx.env.cwd_dir
    boot = cwd / "arch" / "arm" / "boot"
    boot.mkdir(parents=True, exist_ok=True)
    (boot / "zImage").write_bytes(b"ZIMAGE")
    (cwd / ".config").write_text(
        "CONFIG_ARCH_MSM8974=y\n"
        "# CONFIG_MSM_SOC_REV_NONE is not set\n"
        "CONFIG_ARCH_QCOM=y\n"
    )
    mktemp_root = ctx.env.state_dir / "mktemp"
    mktemp_root.mkdir(parents=True, exist_ok=True)
    ctx.dtc_log = ctx.env.state_dir / "dtc.log"
    ctx.python_log = ctx.env.state_dir / "python.log"
    ctx.mktemp_log = ctx.env.state_dir / "mktemp.log"
    ctx.env.shim("dtc", DTC_SHIM)
    ctx.env.shim("python", PYTHON_SHIM)
    ctx.env.shim("mktemp", MKTEMP_SHIM)
    ctx.env.set_env(
        DTC_LOG=str(ctx.dtc_log),
        PYTHON_LOG=str(ctx.python_log),
        MKTEMP_LOG=str(ctx.mktemp_log),
        MKTEMP_ROOT=str(mktemp_root),
    )
    _clean_tmp()


@given("a kernel tree with an MSM arch enabled in .config")
def given_kernel_tree(ctx):
    _make_tree(ctx)


@given("device tree sources matching the configured arch")
def given_dts_sources(ctx):
    dts = ctx.env.cwd_dir / "arch" / "arm" / "boot" / "dts"
    dts.mkdir(parents=True, exist_ok=True)
    (dts / "qcom-msm8974.dts").write_text("/dts-v1/;\n")
    (dts / "qcom-msm8974.dtsi").write_text("/dts-v1/;\n")
    (dts / "other-soc.dts").write_text("/dts-v1/;\n")


@when("akernel runs")
def when_akernel_runs(ctx):
    ctx.proc = ctx.env.run("akernel")


@then("each matching dts is compiled to a dtb with dtc")
def then_dts_compiled(ctx):
    log = ctx.dtc_log.read_text()
    assert "dtc -p 1024 -O dtb -o /tmp/file.dtb arch/arm/boot/dts/qcom-msm8974.dts" in log
    assert "other-soc.dts" not in log
    assert ".dtsi" not in log


@then("each dtb is appended to the zImage copy in /tmp")
def then_dtb_appended(ctx):
    bundled = Path("/tmp/zImage.tmp").read_bytes()
    assert bundled == b"ZIMAGE" + b"DTB(qcom-msm8974.dts)\n"
    _clean_tmp()


@then("the bundled image is unpacked and rebuilt as out.img using droidtools")
def then_droidtools(ctx):
    log = ctx.python_log.read_text()
    assert "unpackbootimg.extract('boot.img'" in log
    assert ".build('out.img')" in log
    assert (ctx.env.cwd_dir / "out.img").exists()
    assert ctx.proc.returncode == 0
    _clean_tmp()
