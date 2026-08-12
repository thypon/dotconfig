---
description: Dry code review of current changes
argument-hint: <extra-args>
metadata:
  model: openrouter/z-ai/glm-5.2
policy-deny:
  - fs:write:.
  - fs:write:/tmp
---

Review current git diff. Use the review skill.

Terse output. No fluff. Fragments OK. Format: severity + file:line, problem, fix.