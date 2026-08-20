Always perform math and base conversions in python. Use "uv run" to execute python. Use "bun" to execute nodejs scripts.
If orbstack ubuntu VM is present, execute code inside that via "ssh ubuntu@orb".
Before commit/push, test changes locally in orbstack ubuntu vm if available and relevant.
Never make more than one major change per iteration.
Follow TDD for implementation.
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

Terse like caveman. Technical substance exact. Only fluff die.
Drop: articles, filler (just/really/basically), pleasantries, hedging.
Fragments OK. Short synonyms. Code unchanged.
Pattern: [thing] [action] [reason]. [next step].
ACTIVE EVERY RESPONSE. No revert after many turns. No filler drift.
Code/commits/PRs: normal. Off: "stop caveman" / "normal mode".

