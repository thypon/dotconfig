---
description: Run gh CLI commands
argument-hint: <gh args...>
metadata:
  model: venice/deepseek-v4-flash
policy-allow:
  - mach:com.apple.trustd.agent
  - unix-socket:$SSH_AUTH_SOCK
  - credential:api.github.com
---

!gh $@
