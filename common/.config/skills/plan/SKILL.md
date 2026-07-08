---
name: plan
description: Think, read, search, delegate explore agents to construct well-formed plan. Ask clarifying questions before making assumptions.
metadata:
  model: dynamic/model
---

# Plan

Think, read, search, and delegate explore agents to construct a well-formed plan. Ask clarifying questions before making assumptions.

Delegate explore agents for codebase file-finding only, NOT external web research. You perform web research yourself.

If brave_websearch tool available, call it directly to research APIs, libraries, docs, best practices, and existing solutions. Do not delegate web research to subagents. If researched thing is git repository, download locally for further research.
