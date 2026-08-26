---
description: Dry code review of current changes
argument-hint: <extra-args>
metadata:
  model: dynamic/model
policy-deny:
  - fs:write:.
  - fs:write:/tmp
---

Review current git diff. Use the review skill.

Terse output. No fluff. Fragments OK. Format: severity + file:line, problem, fix.

Whenever you change your mind or pivot, redo ground truth research based on what you discovered in your thought process. Use search tools and the internet.

If you find an error during implementation, investigate it more (explore agents, codebase search), then search the internet for what might be the problem before fixing.

When solving a known problem, reuse an existing proven solution instead of inventing your own.