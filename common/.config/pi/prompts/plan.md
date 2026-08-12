---
description: Think, research, and construct well-formed plan
argument-hint: [task description]
metadata:
  model: openrouter/z-ai/glm-5.2
policy-deny:
  - fs:write:.
  - fs:write:/tmp
---

/plan $@

Think, read, search, and delegate explore agents to construct a well-formed plan. Ask clarifying questions before making assumptions. Use the plan skill.
