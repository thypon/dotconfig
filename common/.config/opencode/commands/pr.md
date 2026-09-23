---
description: Create PR from recent commits
model: dynamic/small_model
---

/pr $ARGUMENTS

Create PR from most recent commit(s) via `gh pr create`.
Commit message = PR title + body.
Push branch to origin if needed.
Stacked PRs asked → `gh stack` (https://github.com/github/gh-stack): `gh stack init` → `gh stack add <branch>` → `gh stack submit --auto`.
After creation, open PR in browser: `gh pr view --web`.
