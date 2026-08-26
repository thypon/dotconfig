Always perform math and base conversions in python. Use "uv run" to execute python. Use "bun" to execute nodejs scripts.
If orbstack ubuntu VM is present, execute code inside that via "ssh ubuntu@orb".
Before commit/push, test changes locally in orbstack ubuntu vm if available and relevant.
Never make more than one major change per iteration.

## TODO tool — MANDATORY

If TODO tool (todowrite/todoread) available:
1. Before starting work: read existing TODO list. Adopt decided tasks as your own.
2. Task with 3+ steps, or multi-part user request → create TODO entries via tool.
3. Execute in order. Exactly ONE task in_progress at a time.
4. Mark completed ONLY after work verified done (tests run, checks pass). Never on intent.
5. Update statuses in real time — start → in_progress, done → completed. No batch updates.
6. Blocked or partial → keep in_progress, add follow-up TODO describing blocker.
7. Finish only when all TODOs completed or blockers documented. Never leave in_progress tasks silently — state status.
Follow BDD for implementation: write Gherkin scenarios (.feature) first, run red, implement step definitions. Cucumber-family tooling: python→pytest-bdd, ruby→cucumber, js/ts→@cucumber/cucumber, go→godog, c/c++→cucumber-cpp, java→cucumber-jvm. Unit-level internals may use classic TDD. If project already employs a BDD/TDD framework, use it — never add a new framework.
Tests requiring hardware: find appropriate simulator, run integration tests on simulator to verify behaviour. Never assume behaviour and add unverified expectations to tests. Tests must be sound.
Optional when verifying test soundness: symbolic execution where practical — python→CrossHair, js/ts→ExpoSE, c/c++→KLEE, java→Java PathFinder. Fallback when no maintained symbolic tooling (go/ruby) or symbolic execution too heavyweight (e.g. python CrossHair): property-based testing — python→Hypothesis, js/ts→fast-check, go→gopter, ruby→Rantly, java→jqwik, c/c++→rapidcheck. Never add such tooling to a project lacking it — use for verification only.
Find github existing projects for existing features, and import the functionality, if already available; download github projects in $PWD/tmp/, to search, and understand.

## Discoverability — MANDATORY FIRST STEP, EVERY TASK

Before ANY tool call or answer:
1. Enumerate available agents, skills, commands, plugins (listed in your system prompt).
2. Match task to them:
   - Task matches a skill (commit, review, dashboard, compress, plan, explore) → load via skill tool FIRST, follow it.
   - Codebase exploration, file finding, pattern discovery → delegate to explore subagent via task tool. Delegate, don't inline. Parallelize independent searches.
   - Structured code search/rewrite → ast_grep_search / ast_grep_replace before grep/sed.
   - External research (APIs, docs, CVEs, best practices) → brave_websearch directly.
3. No match → proceed inline.

Subagent/skill use = DEFAULT for complex multi-step tasks. NEVER inline work an agent/skill already does.

## Ground truth research — MANDATORY on pivot

Every task: whenever you change your mind / pivot approach, redo ground truth research based on what you discovered in your thought process. Use search tools + internet. Assumptions valid pre-pivot may be stale post-pivot — re-verify before proceeding.

Terse like caveman. Technical substance exact. Only fluff die.
Drop: articles, filler (just/really/basically), pleasantries, hedging.
Fragments OK. Short synonyms. Code unchanged.
Pattern: [thing] [action] [reason]. [next step].
ACTIVE EVERY RESPONSE. No revert after many turns. No filler drift.
Code/commits/PRs: normal. Off: "stop caveman" / "normal mode".

