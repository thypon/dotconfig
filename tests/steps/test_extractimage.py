from pathlib import Path

from pytest_bdd import given, parsers, scenarios, then, when

scenarios("../features/bin/extractimage.feature")

DOCKER_SHIM = """
echo "docker $*" >> "$DOCKER_LOG"
case "$1" in
  run)
    echo container-abc123
    ;;
  export)
    exec /usr/bin/tar cf - -C "$DOCKER_STAGING" .
    ;;
  *)
    exit 1
    ;;
esac
"""

SUDO_SHIM = """
echo "sudo $*" >> "$SUDO_LOG"
exec "$@"
"""

TAR_SHIM = """
echo "tar $*" >> "$TAR_LOG"
exec /usr/bin/tar "$@"
"""


@given(parsers.parse("docker has image {image}"))
def given_image(ctx, image):
    ctx.image = image
    staging = ctx.env.state_dir / "docker-rootfs"
    staging.mkdir(parents=True, exist_ok=True)
    (staging / "exported-marker").write_text("rootfs-marker\n")
    ctx.env.set_env(
        DOCKER_LOG=str(ctx.env.state_dir / "docker.log"),
        SUDO_LOG=str(ctx.env.state_dir / "sudo.log"),
        TAR_LOG=str(ctx.env.state_dir / "tar.log"),
        DOCKER_STAGING=str(staging),
    )
    ctx.env.shim("docker", DOCKER_SHIM)
    ctx.env.shim("sudo", SUDO_SHIM)
    ctx.env.shim("tar", TAR_SHIM)


@when(parsers.parse('extractimage runs with "{image}"'))
def when_run(ctx, image):
    ctx.proc = ctx.env.run("extractimage", image)


@then("docker runs the image with entrypoint true")
def then_docker_run(ctx):
    log = Path(ctx.env.state_dir / "docker.log").read_text().splitlines()
    assert f"docker run -d --entrypoint=true {ctx.image}" in log
    assert any(line.startswith("docker export ") for line in log)


@then("the exported tar is extracted into the current directory")
def then_extracted(ctx):
    marker = ctx.env.cwd_dir / "exported-marker"
    assert marker.read_text() == "rootfs-marker\n"


@then("etc/sudoers.d is created in the current directory")
def then_sudoers(ctx):
    assert (ctx.env.cwd_dir / "etc" / "sudoers.d").is_dir()
