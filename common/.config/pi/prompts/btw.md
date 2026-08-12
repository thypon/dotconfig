---
description: Side question without polluting conversation
argument-hint: <question>
metadata:
  model: ds4/deepseek-v4-flash
policy-deny:
  - fs:write:.
  - fs:write:/tmp
---

$@

Answer this question directly.