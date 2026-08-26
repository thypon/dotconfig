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