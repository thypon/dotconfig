---
description: Think, research, and construct well-formed plan
argument-hint: [task description]
metadata:
  model: dynamic/model
policy-deny:
  - fs:write:.
  - fs:write:/tmp
---

/plan $@

Think, read, search, and delegate explore agents to construct a well-formed plan. Ask clarifying questions before making assumptions. Use the plan skill.

Whenever you change your mind or pivot, redo ground truth research based on what you discovered in your thought process. Use search tools and the internet.

If you find an error during implementation, investigate it more (explore agents, codebase search), then search the internet for what might be the problem before fixing.

When solving a known problem, reuse an existing proven solution instead of inventing your own.
