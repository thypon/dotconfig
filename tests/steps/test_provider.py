import json
import os
from pathlib import Path

from pytest_bdd import given, parsers, scenarios, then, when

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
COMMANDS_SRC = Path(REPO_ROOT) / "common" / ".config" / "opencode" / "commands"

scenarios("../features/bin/provider.feature")

PMSET_LOW_POWER = """
if [ "$1" = "-g" ]; then
  echo "Currently in use:"
  echo " powermode 0"
  exit 0
fi
exit 1
"""

PROVIDERS = {
    "anthropic": {
        "model": "anthropic/claude-sonnet-4-6",
        "small_model": "openrouter/deepseek/deepseek-v4-flash-0731",
        "frontier_model": "anthropic/claude-opus-4-6",
        "antagonist_model": "openrouter/openai/gpt-5.6-terra",
    },
    "openrouter": {
        "model": "openrouter/z-ai/glm-5.3-flash",
        "small_model": "openrouter/deepseek/deepseek-v4-flash-0731",
        "frontier_model": "openrouter/z-ai/glm-5.3",
        "antagonist_model": "openrouter/moonshotai/kimi-k3",
    },
    "local": {
        "model": "ds4/deepseek-v4-flash",
        "small_model": "ds4/deepseek-v4-flash",
        "frontier_model": "ds4/deepseek-v4-flash",
        "antagonist_model": "ds4/deepseek-v4-flash",
    },
}


def replacements_for(name):
    cfg = PROVIDERS[name]
    return {
        "dynamic/provider": name,
        "dynamic/model": cfg["model"],
        "dynamic/small_model": cfg["small_model"],
        "dynamic/frontier_model": cfg["frontier_model"],
        "dynamic/antagonist_model": cfg["antagonist_model"],
    }


def write_models_file(env, names):
    config_dir = env.home / ".config"
    config_dir.mkdir(parents=True, exist_ok=True)
    providers = {name: PROVIDERS[name] for name in names}
    (config_dir / "dynamic-models.jsonc").write_text(
        json.dumps({"providers": providers}, indent=2) + "\n"
    )


def write_opencode_template(env):
    tmpl_dir = env.home / ".config" / "opencode"
    tmpl_dir.mkdir(parents=True, exist_ok=True)
    template = {
        "model": "dynamic/model",
        "small_model": "dynamic/small_model",
        "frontier": {"model": "dynamic/frontier_model"},
        "antagonist": {"model": "dynamic/antagonist_model"},
    }
    (tmpl_dir / "opencode.json.tmpl").write_text(json.dumps(template, indent=2) + "\n")


def write_pi_settings(env, name):
    agent_dir = env.home / ".pi" / "agent"
    agent_dir.mkdir(parents=True, exist_ok=True)
    (agent_dir / "settings.json").write_text(
        json.dumps({"defaultProvider": name}, indent=2) + "\n"
    )


def seed_stale_opencode_config(env):
    out_path = env.home / ".config" / "opencode" / "opencode.json"
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps({"model": "stale/previous-model"}, indent=2) + "\n")


@given("a dynamic-models.jsonc with providers anthropic and local")
def models_with_anthropic_and_local(ctx):
    ctx.env.shim("pmset", PMSET_LOW_POWER)
    write_models_file(ctx.env, ["anthropic", "local"])
    write_opencode_template(ctx.env)


@given(parsers.parse("the deployed settings name the {name} provider"))
def deployed_settings_name_provider(name, ctx):
    write_pi_settings(ctx.env, name)


@given(parsers.parse("the settings file already names provider {name}"))
def settings_already_name_provider(name, ctx):
    ctx.env.shim("pmset", PMSET_LOW_POWER)
    write_models_file(ctx.env, ["anthropic", "openrouter", "local"])
    write_opencode_template(ctx.env)
    write_pi_settings(ctx.env, name)
    seed_stale_opencode_config(ctx.env)
    ctx.deployed = name


@given("the commands template directory has dynamic tokens")
def commands_template_has_dynamic_tokens(ctx):
    files = sorted(p for p in COMMANDS_SRC.iterdir() if p.is_file())
    assert files, f"no command templates in {COMMANDS_SRC}"
    assert any("dynamic/" in p.read_text() for p in files)


@when(parsers.parse('provider runs with "{prefix}"'))
def provider_runs_with_prefix(prefix, ctx):
    ctx.proc = ctx.env.run("provider", prefix)


@when("provider runs with no arguments")
def provider_runs_without_args(ctx):
    ctx.proc = ctx.env.run("provider")


@then(parsers.parse("the deployed config has model tokens resolved to the {name} models"))
def deployed_config_resolved(name, ctx):
    repl = replacements_for(name)
    deployed = json.loads(
        (ctx.env.home / ".config" / "opencode" / "opencode.json").read_text()
    )
    assert deployed["model"] == repl["dynamic/model"]
    assert deployed["small_model"] == repl["dynamic/small_model"]
    assert deployed["frontier"]["model"] == repl["dynamic/frontier_model"]
    assert deployed["antagonist"]["model"] == repl["dynamic/antagonist_model"]
    assert "dynamic/" not in json.dumps(deployed)
    settings = json.loads((ctx.env.home / ".pi" / "agent" / "settings.json").read_text())
    assert settings["defaultProvider"] == name
    assert settings["defaultModel"] == repl["dynamic/model"]
    assert settings["enabledModels"] == [
        repl["dynamic/model"],
        repl["dynamic/small_model"],
        repl["dynamic/frontier_model"],
        repl["dynamic/antagonist_model"],
    ]


@then(parsers.parse("the template is resolved against {name} again"))
def template_resolved_again(name, ctx):
    repl = replacements_for(name)
    deployed = json.loads(
        (ctx.env.home / ".config" / "opencode" / "opencode.json").read_text()
    )
    assert deployed["model"] == repl["dynamic/model"]
    assert deployed["small_model"] == repl["dynamic/small_model"]
    assert "stale/" not in json.dumps(deployed)
    settings = json.loads((ctx.env.home / ".pi" / "agent" / "settings.json").read_text())
    assert settings["defaultProvider"] == name


@then("no config is deployed")
def no_config_deployed(ctx):
    assert not (ctx.env.home / ".config" / "opencode" / "opencode.json").exists()
    assert not (ctx.env.home / ".pi" / "agent" / "settings.json").exists()


@then("every command file under the live opencode config is a resolved copy")
def commands_are_resolved_copies(ctx):
    repl = replacements_for(ctx.deployed)
    live_dir = ctx.env.home / ".config" / "opencode" / "commands"
    live_names = sorted(p.name for p in live_dir.iterdir() if p.is_file())
    src_names = sorted(p.name for p in COMMANDS_SRC.iterdir() if p.is_file())
    assert live_names, "no command files deployed"
    assert live_names == src_names
    for fname in live_names:
        expected = (COMMANDS_SRC / fname).read_text()
        for token, value in repl.items():
            expected = expected.replace(token, value)
        got = (live_dir / fname).read_text()
        assert got == expected, f"{fname} is not a resolved copy"
        assert "dynamic/" not in got
