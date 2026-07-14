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