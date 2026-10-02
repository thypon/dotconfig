import base64
import hashlib
import json
import os
import shutil
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from pytest_bdd import given, parsers, scenarios, then, when

scenarios("../features/bin/brave_models.feature")

DAY = 86400
NOW = time.time()
VENICE_CHAT_URL = "https://api.venice.ai/api/v1/chat/completions"

DS4_SUPPORTED = [
    "tools", "tool_choice", "max_tokens", "temperature", "top_p", "top_k",
    "min_p", "ignore_eos", "stop", "seed", "stream", "reasoning_effort",
]


def _venice_entry(mid, name, age_days, tools=False, vision=False):
    return {
        "id": mid,
        "object": "model",
        "created": int(NOW - age_days * DAY),
        "owned_by": "venice.ai",
        "type": "text",
        "model_spec": {
            "name": name,
            "availableContextTokens": 131072,
            "capabilities": {
                "supportsFunctionCalling": tools,
                "supportsVision": vision,
            },
        },
    }


def _ds4_entry(mid, name):
    return {
        "id": mid,
        "object": "model",
        "created": 1767225600,
        "owned_by": "ds4.c",
        "name": name,
        "context_length": 100000,
        "top_provider": {
            "context_length": 100000,
            "max_completion_tokens": 100000,
            "is_moderated": False,
        },
        "supported_parameters": DS4_SUPPORTED,
    }


VENICE_CATALOG = {
    "object": "list",
    "data": [
        _venice_entry("openai-gpt-61-sol", "GPT-6.1 Sol", 2, tools=True),
        _venice_entry("openai-gpt-6-astra-pro", "GPT-6 Astra Pro", 26),
        _venice_entry("openai-gpt-oss-120b", "GPT-OSS 120B", 329),
        _venice_entry("e2ee-gpt-oss-120b-p", "GPT-OSS 120B", 197),
        _venice_entry("claude-opus-5-5", "Claude Opus 5.5", 13, tools=True),
        _venice_entry("claude-opus-5-5-fast", "Claude Opus 5.5 Fast", 5),
        _venice_entry("claude-sonnet-5-5", "Claude Sonnet 5.5", 5, tools=True),
        _venice_entry("claude-fable-5-1", "Claude Fable 5.1", 33),
        _venice_entry("grok-4-7", "Grok 4.7", 15, tools=True),
        _venice_entry("grok-4-20", "Grok 4.20", 203),
        _venice_entry("grok-4-6", "Grok 4.6", 52),
        _venice_entry("deepseek-v4-1-flash", "DeepSeek V4.1 Flash", 21),
        _venice_entry("deepseek-v4-pro-0813", "DeepSeek V4 Pro 0813", 48),
        _venice_entry("e2ee-deepseek-v4-flash", "DeepSeek V4 Flash", 86),
        _venice_entry("deepseek-v4-flash-0731", "DeepSeek V4 Flash", 62),
        _venice_entry("zai-org-glm-5-3", "GLM 5.3", 44, tools=True),
        _venice_entry("zai-org-glm-5-3-flash", "GLM 5.3 Flash", 41),
        _venice_entry("zai-org-glm-5-2", "GLM 5.2", 107),
        _venice_entry("e2ee-glm-5-3-p", "GLM 5.3", 25, tools=True),
        _venice_entry("e2ee-glm-5-3-flash", "GLM 5.3 Flash", 25),
        _venice_entry(
            "olafangensan-glm-4.7-flash-heretic", "GLM 4.7 Flash Heretic", 60
        ),
        _venice_entry("qwen-3-8-flash", "Qwen 3.8 Flash", 21),
        _venice_entry("qwen-3-8-max", "Qwen 3.8 Max", 71),
        _venice_entry("qwen-3-8-27b", "Qwen 3.8 27B", 45),
        _venice_entry("qwen3-6-35b-a3b", "Qwen 3.6 35B A3B", 73),
        _venice_entry("e2ee-kimi-k3-p", "Kimi K3", 23, tools=True),
        _venice_entry("kimi-k3", "Kimi K3", 77),
        _venice_entry("kimi-k3-fast-api", "Kimi K3 Fast", 59),
        _venice_entry("gemini-3-8-flash", "Gemini 3.8 Flash", 29, vision=True),
        _venice_entry("gemini-3-1-pro-preview", "Gemini 3.1 Pro Preview", 224),
        _venice_entry("xiaomi-mimo-v2-6-flash", "MiMo-V2.6-Flash", 3),
        _venice_entry("xiaomi-mimo-v2-5", "MiMo-V2.5", 112),
        _venice_entry("aion-labs-aion-3-5", "Aion 3.5", 8),
        _venice_entry("aion-labs-aion-3-5-mini", "Aion 3.5 Mini", 8),
        _venice_entry("mercury-2-5", "Mercury 2.5", 23),
        _venice_entry("inkling", "Inkling", 77),
        _venice_entry("seed-2-1-turbo", "Seed 2.1 Turbo", 95),
        _venice_entry(
            "nvidia-nemotron-3-ultra-550b-a55b", "NVIDIA Nemotron 3 Ultra", 119
        ),
        _venice_entry("llama-3.3-70b", "Llama 3.3 70B", 543),
        _venice_entry("venice-uncensored-1-2", "Venice Uncensored 1.2", 400),
        _venice_entry(
            "e2ee-gemma-4-26b-a4b-uncensored-p", "Gemma 4 26B Uncensored", 60
        ),
        _venice_entry("google-gemma-4-31b-it", "Gemma 4 31B IT", 181),
        _venice_entry("minimax-m27", "MiniMax M27", 197),
    ],
}

DS4_CATALOG = {
    "object": "list",
    "data": [
        _ds4_entry("glm-5.3-flash", "GLM 5.3 Flash"),
        _ds4_entry("glm-5.3-flash-chat", "GLM 5.3 Flash Chat"),
        _ds4_entry("glm-5.3-flash-reasoner", "GLM 5.3 Flash Reasoner"),
    ],
}


class _JSONHandler(BaseHTTPRequestHandler):
    def do_GET(self):  # noqa: N802
        handler = getattr(self.server, "routes", {}).get(self.path)
        payload = None
        if handler is not None:
            try:
                payload = handler() if callable(handler) else handler
            except Exception:
                payload = None
        if payload is None:
            self.send_response(503)
            self.send_header("Content-Length", "0")
            self.end_headers()
            return
        body = json.dumps(payload).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, format, *args):  # noqa: A002
        pass


def _start_server(routes):
    server = ThreadingHTTPServer(("127.0.0.1", 0), _JSONHandler)
    server.routes = routes  # type: ignore[attr-defined]
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    return server


PGREP_SHIM = """#!/bin/sh
echo "pgrep $*" >> "$PGREP_LOG"
if [ "$2" = "$PGREP_APP" ] && [ -f "$PGREP_PIDS" ]; then
  cat "$PGREP_PIDS"
fi
exit 0
"""

OSASCRIPT_SHIM = """#!/bin/sh
echo "osascript $*" >> "$OSASCRIPT_LOG"
if printf '%s' "$*" | grep -q quit; then
  if [ ! -f "$OSASCRIPT_PRESERVE_PIDS" ]; then
    rm -f "$PGREP_PIDS"
  fi
fi
exit 0
"""

OPEN_SHIM = """#!/bin/sh
echo "open $*" >> "$OPEN_LOG"
exit 0
"""

SECURITY_SHIM = """#!/bin/sh
echo "security $*" >> "$SECURITY_LOG"
printf '%s\\n' "$KEYCHAIN_SECRET"
exit 0
"""

DS4_SHIM = """#!/bin/sh
echo "ds4 $*" >> "$DS4_LOG"
touch "$DS4_READY_FLAG"
exit 0
"""

DEV_APP_DIRNAME = "Brave Browser Development.app"
DEV_CHANNEL = "Brave-Browser-Development"
MOCK_KEYCHAIN_PASSWORD = "mock_password"

# Known-answer from keychain_key_provider_unittest.mm:
# PBKDF2-HMAC-SHA1("mock_password", "saltysalt", 1003), 16 bytes.
_MOCK_KEYCHAIN_KAT = bytes.fromhex("af0f762aaf6d7d11581b7aa8ce7218de")


def _os_crypt_blob(plaintext, keychain_password):
    """Recompute Brave's OSCrypt mac "v10" blob independently: PBKDF2-HMAC-
    SHA1(keychain password, b"saltysalt", 1003) -> AES-128-CBC with the fixed
    16-space IV -> "v10" prefix -> base64 (mirrors encryptor.cc +
    keychain_key_provider.mm)."""
    from cryptography.hazmat.primitives import padding
    from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes

    key = hashlib.pbkdf2_hmac(
        "sha1", keychain_password.encode(), b"saltysalt", 1003, dklen=16
    )
    padder = padding.PKCS7(128).padder()
    padded = padder.update(plaintext.encode()) + padder.finalize()
    enc = Cipher(algorithms.AES(key), modes.CBC(b" " * 16)).encryptor()
    return base64.b64encode(b"v10" + enc.update(padded) + enc.finalize()).decode()


def _prefs_skeleton():
    return {
        "brave": {
            "ai_chat": {
                "custom_models": [],
                "default_model_key": "chat-claude-sonnet",
                "tab_organization_model_key": "chat-claude-sonnet",
            }
        }
    }


def _make_brave_tree(base):
    """Fake BraveSoftware tree: Nightly (4 real + 2 skipped profiles), Beta,
    and a Development channel (the local pnpm-start dev build)."""
    nightly = base / "Brave-Browser-Nightly"
    profiles = {
        "Default": _prefs_skeleton(),
        "Profile 3": {
            "brave": {
                "ai_chat": {
                    "custom_models": [
                        {
                            "key": "user-test-key",
                            "label": "test",
                            "endpoint_url": "https://example.invalid/v1",
                            "api_key": "",
                            "context_size": 8192,
                            "model_request_name": "test",
                            "supports_tools": False,
                            "vision_support": False,
                        }
                    ],
                    "default_model_key": "chat-claude-sonnet",
                }
            }
        },
        "ai_chat_agent_profile": _prefs_skeleton(),
        "Guest Profile": _prefs_skeleton(),
        "System Profile": _prefs_skeleton(),
    }
    info_cache = {
        "Default": {"name": "Default"},
        "Profile 3": {"name": "Google"},
        "ai_chat_agent_profile": {"name": "Leo AI Content Agent"},
    }
    for profile, prefs in profiles.items():
        profile_dir = nightly / profile
        profile_dir.mkdir(parents=True)
        (profile_dir / "Preferences").write_text(
            json.dumps(prefs, separators=(",", ":"))
        )
    (nightly / "Local State").write_text(
        json.dumps({"profile": {"info_cache": info_cache}})
    )

    beta = base / "Brave-Browser-Beta"
    beta_profile = beta / "Beta"
    beta_profile.mkdir(parents=True)
    (beta_profile / "Preferences").write_text(
        json.dumps(_prefs_skeleton(), separators=(",", ":"))
    )
    (beta / "Local State").write_text(
        json.dumps({"profile": {"info_cache": {"Beta": {"name": "Beta"}}}})
    )

    development = base / "Brave-Browser-Development"
    dev_profile = development / "Default"
    dev_profile.mkdir(parents=True)
    (dev_profile / "Preferences").write_text(
        json.dumps(_prefs_skeleton(), separators=(",", ":"))
    )
    (development / "Local State").write_text(
        json.dumps({"profile": {"info_cache": {"Default": {"name": "Default"}}}})
    )


def _ds4_key(model_id):
    return "custom:" + hashlib.md5(f"ds4:{model_id}".encode()).hexdigest()[:8]


def _venice_key(model_id):
    return "custom:" + hashlib.md5(f"venice:{model_id}".encode()).hexdigest()[:8]


@given("a fake Brave installation with Nightly, Beta, and Development channels")
def fake_brave_installation(ctx):
    base = ctx.env.home / "BraveSoftware"
    base.mkdir(parents=True)
    _make_brave_tree(base)
    ctx.brave_base = base
    ctx.ds4_ready = ctx.env.state_dir / "ds4-ready"

    # Venice + ds4 served over real localhost HTTP; payload shapes verified
    # against the live Venice API and the ds4_server.c source.
    ctx.venice_server = _start_server(
        {"/v1/models?type=text": VENICE_CATALOG}
    )
    venice_port = ctx.venice_server.server_address[1]

    def ds4_models():
        if ctx.ds4_ready.exists():
            return DS4_CATALOG
        return None  # simulates ds4 being down

    ctx.ds4_server = _start_server({"/v1/models": ds4_models})
    ds4_port = ctx.ds4_server.server_address[1]

    ctx.env.shim("pgrep", PGREP_SHIM)
    ctx.env.shim("osascript", OSASCRIPT_SHIM)
    ctx.env.shim("open", OPEN_SHIM)
    ctx.env.shim("security", SECURITY_SHIM)
    ctx.env.shim("ds4", DS4_SHIM)
    uv_dir = os.path.dirname(
        shutil.which("uv") or ""
    ) or "/opt/homebrew/bin"
    ctx.env.set_env(
        PATH=f"{ctx.env.bin_dir}:{uv_dir}:/usr/bin:/bin:/usr/sbin:/sbin",
        BRAVE_SOFTWARE_DIR=str(base),
        BRAVE_VENICE_MODELS_URL=f"http://127.0.0.1:{venice_port}/v1/models?type=text",
        DS4_URL=f"http://127.0.0.1:{ds4_port}",
        BRAVE_MODELS_QUIT_TIMEOUT="1",
        BRAVE_MODELS_DS4_WAIT="1",
        PGREP_LOG=str(ctx.env.state_dir / "pgrep.log"),
        PGREP_PIDS=str(ctx.env.state_dir / "pids"),
        OSASCRIPT_LOG=str(ctx.env.state_dir / "osascript.log"),
        OPEN_LOG=str(ctx.env.state_dir / "open.log"),
        SECURITY_LOG=str(ctx.env.state_dir / "security.log"),
        DS4_LOG=str(ctx.env.state_dir / "ds4.log"),
        DS4_READY_FLAG=str(ctx.ds4_ready),
        UV_CACHE_DIR=os.path.expanduser("~/Library/Caches/uv"),
    )


@given("the Venice API answers with a text-model catalog")
def venice_catalog_ready(ctx):
    assert ctx.venice_server is not None


@given("the ds4 server answers with its model list")
def ds4_catalog_ready(ctx):
    ctx.ds4_ready.touch()


@given("the ds4 server is unreachable")
def ds4_unreachable(ctx):
    ctx.env.set_env(DS4_URL="http://127.0.0.1:1")


@given("Brave Nightly is running")
def brave_running(ctx):
    ctx.ds4_ready.touch()
    ctx.env.set_env(PGREP_APP="Brave Browser Nightly")
    (ctx.env.state_dir / "pids").write_text("4242\n")


@given("Brave Nightly is running and refuses to quit")
def brave_refuses_quit(ctx):
    ctx.ds4_ready.touch()
    ctx.env.set_env(
        PGREP_APP="Brave Browser Nightly",
        OSASCRIPT_PRESERVE_PIDS=str(ctx.env.state_dir / "quit-refused"),
        BRAVE_MODELS_QUIT_TIMEOUT="1",
    )
    (ctx.env.state_dir / "pids").write_text("4242\n")
    (ctx.env.state_dir / "quit-refused").touch()


@given("an existing Venice custom model with encrypted key")
def existing_venice_blob(ctx):
    prefs_path = (
        ctx.brave_base / "Brave-Browser-Nightly" / "Default" / "Preferences"
    )
    prefs = json.loads(prefs_path.read_text())
    prefs["brave"]["ai_chat"]["custom_models"].append(
        {
            "key": "custom:1234abcd",
            "label": "Venice: Old Model",
            "endpoint_url": VENICE_CHAT_URL,
            "api_key": "v10existingblob",
            "context_size": 8192,
            "model_request_name": "old-model",
            "supports_tools": False,
            "vision_support": False,
        }
    )
    prefs_path.write_text(json.dumps(prefs, separators=(",", ":")))


@given("a local Brave development build exists")
def local_dev_build(ctx):
    """Marker .app the script's dev-build glob must find (mirrors
    ~/src/out/Component_arm64/Brave Browser Development.app)."""
    app_dir = ctx.env.home / "src" / "out" / "Component_arm64" / DEV_APP_DIRNAME
    app_dir.mkdir(parents=True)
    ctx.env.set_env(BRAVE_DEV_APP_GLOB=str(app_dir))


@given("the local Development build is running")
def dev_build_running(ctx):
    ctx.ds4_ready.touch()
    ctx.env.set_env(PGREP_APP="Brave Browser Development")
    (ctx.env.state_dir / "pids").write_text("4242\n")


@given("the Brave safe storage keychain entry exists")
def keychain_entry(ctx):
    ctx.env.set_env(KEYCHAIN_SECRET="unit-test-keychain-secret")


@given("a Venice API key is available")
def venice_api_key_available(ctx):
    ctx.env.set_env(
        KEYCHAIN_SECRET="unit-test-keychain-secret",
        VENICE_API_KEY="unit-test-venice-key",
    )


@when("brave-models runs with --dry-run")
def run_dry_run(ctx):
    _run(ctx, "--dry-run")


@when("brave-models runs with --yes")
def run_yes(ctx):
    _run(ctx, "--yes")


@when(parsers.parse('brave-models runs with {flags}'))
def run_flags(ctx, flags):
    _run(ctx, *flags.split())


def _run(ctx, *args):
    ctx.proc = ctx.env.run("brave-models", *args, timeout=120)


PROFILE_DIRS = {"Leo AI Content Agent": "ai_chat_agent_profile"}


def _prefs(ctx, profile):
    return _channel_prefs(ctx, "Brave-Browser-Nightly", profile)


def _channel_prefs(ctx, channel, profile):
    prefs_path = (
        ctx.brave_base
        / channel
        / PROFILE_DIRS.get(profile, profile)
        / "Preferences"
    )
    return json.loads(prefs_path.read_text())


def _labels(prefs):
    return [
        m["label"] for m in prefs["brave"]["ai_chat"]["custom_models"]
    ]


def _selection_ids(stdout):
    return {
        line.strip().split()[0]
        for line in stdout.splitlines()
        if line.startswith("    ") and line.strip()
    }


@then(parsers.parse('the output lists the "{name}" profile'))
def output_lists_profile(ctx, name):
    assert name in ctx.proc.stdout, ctx.proc.stdout


@then(parsers.parse('the output does not list the "{name}" profile'))
def output_not_lists_profile(ctx, name):
    assert name not in ctx.proc.stdout, ctx.proc.stdout


@then(parsers.parse('the selection includes "{model_id}"'))
def selection_includes(ctx, model_id):
    assert model_id in _selection_ids(ctx.proc.stdout), sorted(
        _selection_ids(ctx.proc.stdout)
    )


@then(parsers.parse('the selection does not include "{model_id}"'))
def selection_not_includes(ctx, model_id):
    assert model_id not in _selection_ids(ctx.proc.stdout), sorted(
        _selection_ids(ctx.proc.stdout)
    )


@then("the selection includes the ds4 models")
def selection_includes_ds4(ctx):
    assert "Default Leo model: ds4: GLM 5.3 Flash (local)" in ctx.proc.stdout


@then(parsers.parse('the Nightly "{profile}" preferences contain the Venice models'))
def prefs_contain_venice(ctx, profile):
    assert any(
        label.startswith("Venice: ") for label in _labels(_prefs(ctx, profile))
    )


@then(parsers.parse('the Nightly "{profile}" preferences contain the ds4 models'))
def prefs_contain_ds4(ctx, profile):
    assert "ds4: GLM 5.3 Flash (local)" in _labels(_prefs(ctx, profile))


@then(parsers.parse('the Nightly "{profile}" preferences keep the user model "{label}"'))
def prefs_keep_user_model(ctx, profile, label):
    assert label in _labels(_prefs(ctx, profile))


@then(parsers.parse('the Nightly "{profile}" preferences contain the injected models'))
def prefs_contain_injected(ctx, profile):
    labels = _labels(_prefs(ctx, profile))
    assert any(l.startswith("Venice: ") for l in labels)
    assert any(l.startswith("ds4: ") for l in labels)


@then(parsers.parse('the Nightly "{profile}" default model key is the ds4 model key'))
def default_is_ds4(ctx, profile):
    prefs = _prefs(ctx, profile)
    assert (
        prefs["brave"]["ai_chat"]["default_model_key"]
        == _ds4_key("glm-5.3-flash")
    )


@then(parsers.parse('the Nightly "{profile}" default model key is the strongest Venice model key'))
def default_is_strongest_venice(ctx, profile):
    prefs = _prefs(ctx, profile)
    assert (
        prefs["brave"]["ai_chat"]["default_model_key"]
        == _venice_key("openai-gpt-61-sol")
    )


@then("no ds4 models are injected")
def no_ds4_models(ctx):
    assert not any(
        label.startswith("ds4: ") for label in _labels(_prefs(ctx, "Default"))
    )


@then('the Nightly Local State contains "brave-ai-chat-allow-private-ips@1"')
def local_state_flag(ctx):
    path = ctx.brave_base / "Brave-Browser-Nightly" / "Local State"
    state = json.loads(path.read_text())
    assert "brave-ai-chat-allow-private-ips@1" in (
        state["browser"]["enabled_labs_experiments"]
    )


@then("Brave Nightly is quit via osascript")
def brave_quit_logged(ctx):
    log = (ctx.env.state_dir / "osascript.log").read_text()
    assert 'quit app "Brave Browser Nightly"' in log, log


@then("Brave Nightly is relaunched via open")
def brave_relaunched_logged(ctx):
    log = (ctx.env.state_dir / "open.log").read_text()
    assert "open -a Brave Browser Nightly" in log, log


@then(parsers.parse('the Nightly "{profile}" preferences are unchanged'))
def prefs_unchanged(ctx, profile):
    prefs = _prefs(ctx, profile)
    assert prefs["brave"]["ai_chat"]["default_model_key"] == "chat-claude-sonnet"
    assert not any(
        label.startswith(("Venice: ", "ds4: ")) for label in _labels(prefs)
    )


@then('the Beta "Beta" preferences contain the injected models')
def beta_prefs_contain_injected(ctx):
    prefs = json.loads(
        (ctx.brave_base / "Brave-Browser-Beta" / "Beta" / "Preferences").read_text()
    )
    labels = [m["label"] for m in prefs["brave"]["ai_chat"]["custom_models"]]
    assert any(l.startswith("Venice: ") for l in labels)
    assert any(l.startswith("ds4: ") for l in labels)


@then("no backup files are created")
def no_backups(ctx):
    assert list(ctx.brave_base.rglob("*.bak.*")) == []


@then("the written Venice models keep that api key")
def blob_reused(ctx):
    models = _prefs(ctx, "Default")["brave"]["ai_chat"]["custom_models"]
    venice = [m for m in models if m["label"].startswith("Venice: ")]
    assert venice
    assert all(m["api_key"] == "v10existingblob" for m in venice)


@then("the written Venice models store an encrypted api key")
def encrypted_key(ctx):
    models = _prefs(ctx, "Default")["brave"]["ai_chat"]["custom_models"]
    venice = [m for m in models if m["label"].startswith("Venice: ")]
    assert venice
    for m in venice:
        assert m["api_key"] != "secret-venice-key"
        assert base64.b64decode(m["api_key"]).startswith(b"v10")


# --------------------------------------------------------------------------
# Local development build (pnpm/npm start) — mock-keychain channel
# --------------------------------------------------------------------------


def _venice_models(prefs):
    models = prefs["brave"]["ai_chat"]["custom_models"]
    venice = [m for m in models if m["label"].startswith("Venice: ")]
    assert venice
    return venice


@then(parsers.parse('the Development "{profile}" preferences contain the injected models'))
def dev_prefs_contain_injected(ctx, profile):
    labels = _labels(_channel_prefs(ctx, DEV_CHANNEL, profile))
    assert any(l.startswith("Venice: ") for l in labels)
    assert any(l.startswith("ds4: ") for l in labels)


@then(parsers.parse('the Development "{profile}" default model key is the ds4 model key'))
def dev_default_is_ds4(ctx, profile):
    prefs = _channel_prefs(ctx, DEV_CHANNEL, profile)
    assert (
        prefs["brave"]["ai_chat"]["default_model_key"]
        == _ds4_key("glm-5.3-flash")
    )


@then('the Development Local State contains "brave-ai-chat-allow-private-ips@1"')
def dev_local_state_flag(ctx):
    path = ctx.brave_base / DEV_CHANNEL / "Local State"
    state = json.loads(path.read_text())
    assert "brave-ai-chat-allow-private-ips@1" in (
        state["browser"]["enabled_labs_experiments"]
    )


@then("the Development Venice models store the mock-keychain api key")
def dev_venice_mock_key(ctx):
    assert hashlib.pbkdf2_hmac(
        "sha1", MOCK_KEYCHAIN_PASSWORD.encode(), b"saltysalt", 1003, dklen=16
    ) == _MOCK_KEYCHAIN_KAT
    expected = _os_crypt_blob("unit-test-venice-key", MOCK_KEYCHAIN_PASSWORD)
    for m in _venice_models(_channel_prefs(ctx, DEV_CHANNEL, "Default")):
        assert m["api_key"] == expected, m["label"]


@then("the Nightly Venice models store the real-keychain api key")
def nightly_venice_real_key(ctx):
    expected = _os_crypt_blob("unit-test-venice-key", "unit-test-keychain-secret")
    for m in _venice_models(_prefs(ctx, "Default")):
        assert m["api_key"] == expected, m["label"]


@then("the Development Venice models keep that api key")
def dev_blob_reused(ctx):
    for m in _venice_models(_channel_prefs(ctx, DEV_CHANNEL, "Default")):
        assert m["api_key"] == "v10existingblob", m["label"]


@then(
    "the output warns that the mock-keychain build cannot use the stored key"
)
def mock_fallback_warned(ctx):
    assert "could not decrypt" in ctx.proc.stderr, ctx.proc.stderr


@then("the development build is quit via osascript")
def dev_build_quit_logged(ctx):
    log = (ctx.env.state_dir / "osascript.log").read_text()
    assert 'quit app "Brave Browser Development"' in log, log


@then("the development build is relaunched via open with the mock keychain")
def dev_build_relaunched_mock(ctx):
    log = (ctx.env.state_dir / "open.log").read_text()
    assert (
        "open -a Brave Browser Development --args --use-mock-keychain" in log
    ), log
