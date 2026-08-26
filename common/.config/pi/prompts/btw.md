---
description: Side question without polluting conversation
argument-hint: <question>
metadata:
  model: dynamic/small_model
policy-deny:
  - fs:write:.
  - fs:write:/tmp
---

$@

Answer this question directly.

Whenever you change your mind or pivot, redo ground truth research based on what you discovered in your thought process. Use search tools and the internet.

If you find an error during implementation, investigate it more (explore agents, codebase search), then search the internet for what might be the problem before fixing.

When solving a known problem, reuse an existing proven solution instead of inventing your own.