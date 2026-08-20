---
name: plan
description: Think, read, search, delegate explore agents to construct well-formed plan. Ask clarifying questions before making assumptions.
metadata:
  model: dynamic/model
policy-deny:
  - fs:write:.
  - fs:write:/tmp
---

# Plan

Think, read, search, and delegate explore agents to construct a well-formed plan. Ask clarifying questions before making assumptions.

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

Delegate explore agents for codebase file-finding only, NOT external web research. You perform web research yourself.

If brave_websearch tool available, call it directly to research APIs, libraries, docs, best practices, and existing solutions. Do not delegate web research to subagents. If researched thing is git repository, download locally for further research.
