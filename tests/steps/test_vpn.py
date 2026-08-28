from pytest_bdd import parsers, scenarios, then, when

scenarios("../features/bin/vpn.feature")

DTACH_SHIM = """
echo "dtach $*" >> "$DTACH_LOG"
if [ "$1" = "-A" ]; then
  shift 2
  exec "$@"
fi
exit 1
"""

SUDO_SHIM = """
echo "sudo $*" >> "$SUDO_LOG"
if [ "$1" = "/usr/bin/openvpn" ]; then
  shift
  exec openvpn "$@"
fi
exec "$@"
"""

OPENVPN_SHIM = """
echo "openvpn $*" >> "$OPENVPN_LOG"
"""


@when(parsers.parse('vpn runs with "{name}"'))
def when_vpn_runs(ctx, name):
    ctx.dtach_log = ctx.env.state_dir / "dtach.log"
    ctx.sudo_log = ctx.env.state_dir / "sudo.log"
    ctx.openvpn_log = ctx.env.state_dir / "openvpn.log"
    ctx.env.shim("dtach", DTACH_SHIM)
    ctx.env.shim("sudo", SUDO_SHIM)
    ctx.env.shim("openvpn", OPENVPN_SHIM)
    ctx.env.set_env(
        DTACH_LOG=str(ctx.dtach_log),
        SUDO_LOG=str(ctx.sudo_log),
        OPENVPN_LOG=str(ctx.openvpn_log),
    )
    ctx.vpn_name = name
    ctx.proc = ctx.env.run("vpn", name)


@then("dtach -A /tmp/vpnwork runs sudo openvpn /etc/openvpn/work.ovpn")
def then_dtach_runs_openvpn(ctx):
    assert ctx.dtach_log.read_text() == (
        "dtach -A /tmp/vpnwork sudo /usr/bin/openvpn /etc/openvpn/work.ovpn\n"
    )
    assert ctx.sudo_log.read_text() == (
        "sudo /usr/bin/openvpn /etc/openvpn/work.ovpn\n"
    )
    assert ctx.openvpn_log.read_text() == "openvpn /etc/openvpn/work.ovpn\n"
    assert ctx.proc.returncode == 0
