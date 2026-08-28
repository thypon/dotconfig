import importlib.machinery
import importlib.util
import os
import stat
import sys

import pytest
from pytest_bdd import given, parsers, scenarios, then, when

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
PROVIDER_PATH = os.path.join(REPO_ROOT, "common", ".local", "bin", "provider")

scenarios(os.path.join(REPO_ROOT, "tests", "features", "provider_hpm.feature"))

PMSET_PLAIN_SHIM = """#!/bin/sh
echo "Currently in use:"
echo " powermode $FAKE_PM"
"""

PMSET_GARBAGE_SHIM = """#!/bin/sh
echo "unhandled argument: -g"
exit 1
"""


def load_provider_module():
    loader = importlib.machinery.SourceFileLoader("provider_under_test", PROVIDER_PATH)
    spec = importlib.util.spec_from_loader(loader.name, loader)
    module = importlib.util.module_from_spec(spec)
    loader.exec_module(module)
    return module


@pytest.fixture(scope="session")
def provider_module():
    return load_provider_module()


@pytest.fixture
def fake_path(tmp_path, monkeypatch):
    bin_dir = tmp_path / "bin"
    bin_dir.mkdir()
    monkeypatch.setenv("PATH", str(bin_dir) + ":/usr/bin:/bin:/usr/sbin:/sbin")
    return bin_dir


def write_pmset_shim(bin_dir, body):
    shim = bin_dir / "pmset"
    shim.write_text(body)
    shim.chmod(shim.stat().st_mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH)


@given("the provider module is loaded")
def provider_loaded(provider_module, fake_path):
    write_pmset_shim(fake_path, PMSET_PLAIN_SHIM)


@given(parsers.parse('pmset reports powermode "{value}"'))
def pmset_powermode(value, fake_path, monkeypatch):
    # pmset is macOS-only: make the module-under-test take the darwin branch
    # so the HPM routing matrix is exercised on any host OS
    monkeypatch.setattr(sys, "platform", "darwin")
    write_pmset_shim(fake_path, PMSET_PLAIN_SHIM)
    monkeypatch.setenv("FAKE_PM", value)


@given("pmset reports garbage")
def pmset_garbage(fake_path, monkeypatch):
    monkeypatch.setattr(sys, "platform", "darwin")
    write_pmset_shim(fake_path, PMSET_GARBAGE_SHIM)


@given("no pmset binary on PATH")
def no_pmset(fake_path, monkeypatch):
    monkeypatch.setattr(sys, "platform", "darwin")


@given("the DS4 server is available")
def ds4_up(provider_module, monkeypatch):
    monkeypatch.setattr(provider_module, "ds4_available", lambda: True)


@given("the DS4 server is not available")
def ds4_down(provider_module, monkeypatch):
    monkeypatch.setattr(provider_module, "ds4_available", lambda: False)


@given(parsers.parse('the configured small model is "{small}"'))
def configured_small(small, provider_module):
    provider_module._last_small = small


@when(parsers.parse('small_model is resolved for provider "{name}"'))
def resolve_small(name, provider_module):
    provider_module._last_config = {
        "name": name,
        "model": "test/frontier",
        "small_model": provider_module._last_small,
        "frontier_model": "test/frontier",
        "antagonist_model": "test/antagonist",
    }


@then(parsers.parse('small_model is "{expected}"'))
def assert_small(expected, provider_module):
    replacements = provider_module.make_replacements(provider_module._last_config)
    assert replacements["dynamic/small_model"] == expected
