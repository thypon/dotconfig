import os
import subprocess

import re

from pytest_bdd import given, parsers, scenarios, then, when

scenarios("../features/bin/verify-ssh.feature")

OPENSSL = "/usr/bin/openssl"


def generate_key(path):
    path = str(path)
    os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
    for suffix in ("", ".pub"):
        if os.path.exists(path + suffix):
            os.remove(path + suffix)
    subprocess.run(
        ["ssh-keygen", "-t", "rsa", "-b", "2048", "-N", "", "-m", "PEM",
         "-q", "-f", path, "-C", "bdd-harness"],
        check=True,
        capture_output=True,
        text=True,
    )


def pkcs8(pub_path):
    out = subprocess.run(
        ["ssh-keygen", "-e", "-f", str(pub_path), "-m", "PKCS8"],
        check=True,
        capture_output=True,
        text=True,
    )
    return out.stdout


def sign_file(key_path, file_path):
    sig_path = str(file_path) + ".sig"
    with open(sig_path, "wb") as fh:
        subprocess.run(
            [OPENSSL, "dgst", "-sign", str(key_path), str(file_path)],
            check=True,
            stdout=fh,
            stderr=subprocess.PIPE,
        )


@given("a signed file msg.txt with its .sig")
def given_signed_msg(ctx):
    key = ctx.env.home / ".ssh" / "id_rsa"
    generate_key(key)
    msg = ctx.env.cwd_dir / "msg.txt"
    msg.write_text("payload to verify\n")
    sign_file(key, msg)
    ctx.key = key


@given(parsers.parse('a "{name}" PKCS8 public key matching the signer'))
def given_pub(ctx, name):
    (ctx.env.cwd_dir / name).write_text(pkcs8(str(ctx.key) + ".pub"))


@given("a signed file msg.txt that was modified after signing")
def given_tampered_msg(ctx):
    key = ctx.env.home / ".ssh" / "id_rsa"
    generate_key(key)
    msg = ctx.env.cwd_dir / "msg.txt"
    msg.write_text("payload to verify\n")
    sign_file(key, msg)
    # A matching pub must exist so the failure comes from the tampered
    # content, not from a missing key file.
    (ctx.env.cwd_dir / "pub").write_text(pkcs8(str(key) + ".pub"))
    msg.write_text("payload to verify\nTAMPERED\n")
    ctx.key = key


@when(parsers.parse("verify-ssh runs with {name}"))
def when_verify_ssh(ctx, name):
    ctx.proc = ctx.env.run("verify-ssh", name)


@then("openssl dgst -verify succeeds")
def then_verify_ok(ctx):
    assert ctx.proc.returncode == 0
    assert "Verified OK" in ctx.proc.stdout


@then("openssl dgst -verify fails")
def then_verify_fails(ctx):
    assert ctx.proc.returncode != 0
    # OpenSSL 3.x (Linux) says "Verification failure", older says "Failure"
    assert re.search("verification failure", ctx.proc.stdout, re.IGNORECASE)
