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