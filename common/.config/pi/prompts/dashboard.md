---
description: GitHub workload dashboard (org/me/pr)
argument-hint: <orgs|me|pr>
metadata:
  model: dynamic/small_model
policy-allow:
  - mach:com.apple.trustd.agent
  - credential:api.github.com
policy-deny:
  - fs:write:.
  - fs:write:/tmp
---

/dashboard $@

Show my GitHub dashboard. Use the dashboard skill.

Whenever you change your mind or pivot, redo ground truth research based on what you discovered in your thought process. Use search tools and the internet.