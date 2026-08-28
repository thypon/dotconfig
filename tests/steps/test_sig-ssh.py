import os
import subprocess

from pytest_bdd import given, parsers, scenarios, then, when

scenarios("../features/bin/sig-ssh.feature")

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


def openssl_verify(pub_pem_path, file_path, sig_path):
    return subprocess.run(
        [OPENSSL, "dgst", "-verify", str(pub_pem_path),
         "-signature", str(sig_path), str(file_path)],
        capture_output=True,
        text=True,
    )


def verify_pub(ctx, pub_path, target_name):
    pem_file = ctx.env.state_dir / target_name
    pem_file.write_text(pkcs8(pub_path))
    return pem_file


def msg_path(ctx):
    return ctx.env.cwd_dir / "msg.txt"


@given("a file msg.txt and an SSH key at ~/.ssh/id_rsa")
def given_default_key(ctx):
    key = ctx.env.home / ".ssh" / "id_rsa"
    generate_key(key)
    msg_path(ctx).write_text("sign me\n")
    ctx.key = key


@given("a file msg.txt and an SSH key pair")
def given_key_pair(ctx):
    key = ctx.env.home / ".ssh" / "id_rsa"
    generate_key(key)
    msg_path(ctx).write_text("sign me\n")
    ctx.key = key


@given("SSH_SIGNATURE is /tmp/alt_key")
def given_alt_key(ctx, request):
    key = "/tmp/alt_key"
    generate_key(key)
    request.addfinalizer(
        lambda: [os.remove(p) for p in (key, key + ".pub") if os.path.exists(p)]
    )
    default = ctx.env.home / ".ssh" / "id_rsa"
    generate_key(default)
    msg_path(ctx).write_text("sign me\n")
    ctx.env.set_env(SSH_SIGNATURE=key)
    ctx.key = key
    ctx.default_key = default


@when(parsers.parse("sig-ssh runs with {name}"))
def when_sig_ssh(ctx, name):
    ctx.proc = ctx.env.run("sig-ssh", name)


@then("msg.txt.sig exists and was produced by openssl dgst -sign")
def then_sig_exists(ctx):
    sig = ctx.env.cwd_dir / "msg.txt.sig"
    assert sig.is_file()
    assert sig.stat().st_size > 0
    pem = verify_pub(ctx, str(ctx.key) + ".pub", "check.pub")
    result = openssl_verify(pem, msg_path(ctx), sig)
    assert "Verified OK" in result.stdout


@then(parsers.parse('a file "{name}" contains the PKCS8 form of the public key'))
def then_pub_pkcs8(ctx, name):
    pub = ctx.env.cwd_dir / name
    assert pub.is_file()
    assert pub.read_text() == pkcs8(str(ctx.key) + ".pub")


@then("/tmp/alt_key is used to sign")
def then_alt_key_used(ctx):
    sig = ctx.env.cwd_dir / "msg.txt.sig"
    assert sig.is_file()
    alt = openssl_verify(
        verify_pub(ctx, "/tmp/alt_key.pub", "alt.pub"), msg_path(ctx), sig
    )
    default = openssl_verify(
        verify_pub(ctx, str(ctx.default_key) + ".pub", "default.pub"),
        msg_path(ctx),
        sig,
    )
    assert "Verified OK" in alt.stdout
    assert "Verified OK" not in default.stdout
