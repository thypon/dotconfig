---
name: bddinit
description: Implement Cucumber BDD tests for every functionality currently covered in main/master branch, with at least 80% coverage gating. Gherkin-first, reuse existing frameworks, cucumber-family tooling per language. Trigger: "/bddinit", "implement cucumber BDD for every functionality", "add BDD tests to this repo".
---

# BDD Coverage

Original prompt it derives from (reused verbatim across projects):

> I want to implement cucumber BDD for every functionality that is currently covered in main/master branch.
> Let's implement cucumber with at least 80% coverage gating of all the functionality in the repository itself.

Optional scope modifiers seen in variants:
- Sub-directory scope: "...for this sub-directory."
- Sync existing specs: "You can check already available SPEC, and try to sync them, automatically."
- Stacked-PR hygiene: "The stacked PR for the previous change should be set to draft for now."

## Workflow

1. Inventory (explore subagent, read-only): map ALL functionality on main/master —
   entry points, modules, CLI commands, HTTP/WS APIs, jobs, config, external calls.
   Note which are externally observable behavior vs pure internals.
2. Framework reuse (mandatory): if repo already employs BDD/TDD framework, use it,
   never add another. Detect: cucumber, pytest-bdd, godog, CucumberSwift, behat,
   rspec-puppet... Check devDependencies, tests/ layout, .feature files.
3. Tooling per language (only if none present):
   python pytest-bdd | ruby cucumber | js/ts @cucumber/cucumber | go godog |
   java cucumber-jvm | swift CucumberSwift | rust cucumber-rs | elixir cucumber-ex |
   php behat | kotlin cucumber-jvm
4. Gherkin first (red): one .feature file per functionality, scenarios express
   observable behavior (Given/When/Then), not implementation details.
   Regression: bugs found later get their own .feature + scenario.
5. Step definitions: implement steps against real code; wire harness (conftest,
   setup, before/after hooks) with tmp isolation for env/HOME/cwd.
6. Stub rule: any stub/mock/fake of an external call (API, service, lib) → FIRST
   test the real call manually, non-destructive (read-only query, dry-run, capture
   real payload). Fake mirrors verified reality only. Never assume shape from memory.
7. Coverage gate: ≥80% on all functionality; wire into CI / Makefile test target
   as a hard gate, not advisory.
8. Validation gate: run full BDD suite + coverage + lints + existing tests. Green
   or fix before stopping. Test on appropriate platform/simulator (e.g. orbstack VM
   for linux, simulator for iOS). Never commit red.
9. Report: feature file count, scenarios per functionality, coverage %, remaining gaps.

## Conventions
- Feature naming: <unit>.feature colocated in tests/features/ (or repo convention).
- Steps read real implementations FIRST; research exact identifiers + line numbers
  before writing steps. No invented behavior.
- One major change per iteration; stacked PRs → draft earlier layers.