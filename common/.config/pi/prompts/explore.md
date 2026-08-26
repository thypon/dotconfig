---
description: Explore codebase structure and find files
argument-hint: [search query]
metadata:
  model: dynamic/small_model
policy-deny:
  - fs:write:.
  - fs:write:/tmp
---

/explore $@

Explore the codebase to find files and answer questions about code structure. Use Glob, Grep, Read, and Bash. Use the explore skill.

Whenever you change your mind or pivot, redo ground truth research based on what you discovered in your thought process. Use search tools and the internet.
