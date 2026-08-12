---
description: Generate terse commit message
argument-hint: <extra-args>
metadata:
  model: ds4/deepseek-v4-flash
policy-allow:
  - mach:com.apple.trustd.agent
  - unix-socket:$SSH_AUTH_SOCK
---

/commit $@

Generate a commit message and commit it. Use conventional commits format.