---
description: Generate terse commit message
argument-hint: <extra-args>
metadata:
  model: dynamic/small_model
policy-allow:
  - mach:com.apple.trustd.agent
  - unix-socket:$SSH_AUTH_SOCK
---

/commit $@

Generate a commit message and commit it. Use conventional commits format.

Whenever you change your mind or pivot, redo ground truth research based on what you discovered in your thought process. Use search tools and the internet.