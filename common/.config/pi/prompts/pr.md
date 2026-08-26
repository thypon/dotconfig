---
description: Create PR from recent commits
argument-hint: <extra-args>
metadata:
  model: dynamic/small_model
policy-allow:
  - mach:com.apple.trustd.agent
  - unix-socket:$SSH_AUTH_SOCK
  - credential:api.github.com
---

/pr $@

Create a PR from the most recent commit(s) using `gh pr create`.
Use the commit message as the PR title and body.
Push current branch to origin if needed.
Use `gh pr view --web` to open the PR in browser after creation.

Whenever you change your mind or pivot, redo ground truth research based on what you discovered in your thought process. Use search tools and the internet.