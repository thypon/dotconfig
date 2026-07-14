---
description: GitHub workload dashboard (org/me/pr)
argument-hint: <orgs|me|pr>
metadata:
  model: dynamic/small_model
policy-allow:
  - mach:com.apple.trustd.agent
policy-deny:
  - fs:write:.
  - fs:write:/tmp
---

/dashboard $@

Show my GitHub dashboard. Use the dashboard skill.