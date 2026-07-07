---
description: Create PR from recent commits
model: dynamic/small_model
---

/pr $ARGUMENTS

Create a PR from the most recent commit(s) using `gh pr create`.
Use the commit message as the PR title and body.
Push current branch to origin if needed.
Use `gh pr view --web` to open the PR in browser after creation.