---
description: Dry cleanup of current changes
argument-hint: <extra-args>
metadata:
  model: dynamic/model
---

/simplify $@

Review current git diff for cleanup only. No bug hunting. No security.

Apply fixes: remove dead code, simplify logic, deduplicate, improve readability, reduce nesting.

Output: terse. One line per fix. <file>:L<line>: <what changed>. <why>.

Whenever you change your mind or pivot, redo ground truth research based on what you discovered in your thought process. Use search tools and the internet.

If you find an error during implementation, investigate it more (explore agents, codebase search), then search the internet for what might be the problem before fixing.

When solving a known problem, reuse an existing proven solution instead of inventing your own.