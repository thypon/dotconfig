---
description: Explore codebase structure and find files
argument-hint: [search query]
metadata:
  model: ds4/deepseek-v4-flash
policy-deny:
  - fs:write:.
  - fs:write:/tmp
---

/explore $@

Explore the codebase to find files and answer questions about code structure. Use Glob, Grep, Read, and Bash. Use the explore skill.
