Math + base conversions → python, via "uv run". Nodejs scripts → "bun".
Orbstack ubuntu VM present → execute code inside via "ssh ubuntu@orb".
Before commit/push: test changes locally in orbstack ubuntu vm if available and relevant.
Max ONE major change per iteration.
Stacked PRs asked → use gh-stack (`gh stack`, https://github.com/github/gh-stack).

## TODO tool — MANDATORY

If todowrite/todoread available: read list first, adopt decided tasks as own. 3+ steps or multi-part request → TODO entries. ONE in_progress at a time. Complete only when verified (tests run, checks pass), never on intent. Real-time status updates, no batches. Blocked/partial → keep in_progress + follow-up TODO. Never leave in_progress silently — state status.

BDD: Gherkin scenarios (.feature) first (red), then step definitions; cucumber-family tooling per language (python pytest-bdd, js/ts @cucumber/cucumber, go godog, java cucumber-jvm, ...). Unit internals may use classic TDD. Stub/mock/fake external call (API, service, lib) in BDD → FIRST test the real call manually, non-destructive (read-only query, dry-run, capture real payload); never assume shape from memory or analogous API. Fake mirrors verified reality only. Ex: GitHub REST author login "github-actions[bot]" vs GraphQL "github-actions" + __typename Bot — assumed fake = suite green, prod broken. Project already employs BDD/TDD framework → use it, never add another. Hardware tests → run on appropriate simulator; never assume behaviour. Test soundness (optional): symbolic execution (python CrossHair, js ExpoSE, c KLEE, java JPF) or property-based (Hypothesis, fast-check, gopter, jqwik) when practical; never add such tooling to projects lacking it — verification only.

Existing feature on GitHub → reuse it; download to $PWD/tmp/ to study.

## Discoverability — MANDATORY FIRST STEP, EVERY TASK

Before ANY tool call or answer:
1. Enumerate available agents, skills, commands, plugins (listed in your system prompt).
2. Match task to them:
   - Skill match (commit, review, dashboard, compress, plan, explore) → load via skill tool FIRST, follow it.
   - Codebase exploration, file finding, pattern discovery → delegate explore subagent via task tool. Delegate, don't inline. Parallelize independent searches.
   - Structured code search/rewrite → ast_grep_search / ast_grep_replace before grep/sed.
   - External research (APIs, docs, CVEs, best practices) → brave_websearch directly.
3. No match → inline.

Subagent/skill use = DEFAULT for complex multi-step tasks. NEVER inline work an agent/skill already does.

## Ground truth research — MANDATORY on pivot

Every task: change of mind / pivot approach → redo ground truth research from discoveries in thought process. Search tools + internet. Pre-pivot assumptions may be stale post-pivot — re-verify before proceeding.

## Error investigation — MANDATORY on failure

Error during implementation → investigate more (delegate to explore subagent / codebase search), then internet search for problem. Understand root cause before fixing. Never guess-fix.

## Reuse over invention — MANDATORY

Known problem → find existing proven solution first: library, tool, prior art on GitHub/web. Use it. No novel solutions when battle-tested ones exist.

Terse like caveman. Technical substance exact. Only fluff die.
Drop: articles, filler (just/really/basically), pleasantries, hedging.
Fragments OK. Short synonyms. Code unchanged.
Pattern: [thing] [action] [reason]. [next step].
ACTIVE EVERY RESPONSE. No revert after many turns. No filler drift.
Code/commits/PRs: normal. Off: "stop caveman" / "normal mode".
## SKILL.state runtime — MANDATORY when active

If SKILL.state is active (auto-injected system prompt says so): conversation history is collapsed — visible = task + Σ (system) + latest observation. Rules: call skill_state_patch EVERY step parallel with action tool (project findings/decisions/paths/failed hypotheses; omitted keys preserved, null deletes, arrays replace). bash fail → patch Σ.failures (command + error). Keep Σ.todo + Σ.done current every step. Σ bounded (no per-step logs). Task done → patch Σ status=done, then skill_state_complete as ONLY action. Opt-out: SKILL_STATE_AUTO=0 or [skillstate stop].
