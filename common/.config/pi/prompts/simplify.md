---
description: Dry cleanup of current changes
argument-hint: <extra-args>
metadata:
  model: dynamic/small_model
---

/simplify $@

Review current git diff for cleanup only. No bug hunting. No security.

Apply fixes: remove dead code, simplify logic, deduplicate, improve readability, reduce nesting.

Output: terse. One line per fix. <file>:L<line>: <what changed>. <why>.