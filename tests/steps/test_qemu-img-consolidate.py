from pathlib import Path

from pytest_bdd import given, parsers, scenarios, then, when

scenarios("../features/bin/qemu-img-consolidate.feature")

QEMU_IMG_SHIM = """
echo "qemu-img $*" >> "$QEMU_IMG_LOG"
if [ "$1" = "convert" ]; then
  prev=""
  last=""
  for a in "$@"; do
    prev=$last
    last=$a
  done
  cp "$prev" "$last"
fi
"""


def vm_paths(ctx, vm):
    return (
        Path(ctx.env.home) / ".vms" / "snapshots" / f"{vm}.img",
        Path(ctx.env.home) / ".vms" / "images" / f"{vm}-backing.img",
    )


def qemu_log(ctx):
    log = Path(ctx.env.state_dir) / "qemu-img.log"
    return log.read_text().splitlines() if log.exists() else []


def setup_qemu(ctx):
    ctx.env.set_env(QEMU_IMG_LOG=str(ctx.env.state_dir / "qemu-img.log"))
    ctx.env.shim("qemu-img", QEMU_IMG_SHIM)


@given(parsers.parse("a snapshot for {vm} and an existing backing image"))
def given_snapshot_and_image(ctx, vm):
    setup_qemu(ctx)
    ctx.vm = vm
    snapshot, image = vm_paths(ctx, vm)
    snapshot.parent.mkdir(parents=True, exist_ok=True)
    image.parent.mkdir(parents=True, exist_ok=True)
    snapshot.write_text("snapshot-data\n")
    image.write_text("backing-data\n")


@given(parsers.parse("no snapshot for {vm}"))
def given_no_snapshot(ctx, vm):
    setup_qemu(ctx)
    ctx.vm = vm


@given(parsers.parse("a snapshot for {vm} but no backing image"))
def given_snapshot_only(ctx, vm):
    setup_qemu(ctx)
    ctx.vm = vm
    snapshot, _ = vm_paths(ctx, vm)
    snapshot.parent.mkdir(parents=True, exist_ok=True)
    snapshot.write_text("snapshot-data\n")


@when(parsers.parse('qemu-img-consolidate runs with "{vm}"'))
def when_run(ctx, vm):
    ctx.proc = ctx.env.run("qemu-img-consolidate", vm)


@then("qemu-img convert writes IMAGE.new from the snapshot")
def then_convert(ctx):
    snapshot, image = vm_paths(ctx, ctx.vm)
    lines = qemu_log(ctx)
    assert lines
    tokens = lines[-1].split()
    assert tokens[1] == "convert"
    assert "-O" in tokens and "qcow2" in tokens
    assert tokens[-2] == str(snapshot)
    assert tokens[-1] == str(image) + ".new"


@then("the old image is rotated to IMAGE.old")
def then_rotated(ctx):
    _, image = vm_paths(ctx, ctx.vm)
    assert Path(str(image) + ".old").read_text() == "backing-data\n"


@then("IMAGE.new takes the backing image place")
def then_consolidated(ctx):
    _, image = vm_paths(ctx, ctx.vm)
    assert image.read_text() == "snapshot-data\n"
    assert not Path(str(image) + ".new").exists()


@then("the output says there is no snapshot")
def then_no_snapshot_msg(ctx):
    snapshot, _ = vm_paths(ctx, ctx.vm)
    assert "There is no snapshot:" in ctx.proc.stdout
    assert str(snapshot) in ctx.proc.stdout


@then("qemu-img is not invoked")
def then_qemu_not_invoked(ctx):
    assert qemu_log(ctx) == []


@then("the output reports the missing image")
def then_missing_image_msg(ctx):
    _, image = vm_paths(ctx, ctx.vm)
    assert str(image) in ctx.proc.stdout
