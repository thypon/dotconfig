---
description: GitHub workload dashboard (org/me/pr)
argument-hint: <orgs|me|pr>
metadata:
  model: ds4/deepseek-v4-flash
policy-allow:
  - mach:com.apple.trustd.agent
  - credential:api.github.com
policy-deny:
  - fs:write:.
  - fs:write:/tmp
---

/dashboard $@

Show my GitHub dashboard. Use the dashboard skill.