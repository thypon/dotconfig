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