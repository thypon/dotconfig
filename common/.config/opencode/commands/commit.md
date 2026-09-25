---
description: Generate terse commit message
model: dynamic/small_model
---

/commit $ARGUMENTS

Generate commit message, commit it. Conventional commits format.

Validation Gate MANDATORY before commit: run Makefile lint/typecheck/test/build targets, ALL git hooks of whatever framework the project uses (pre-commit/lefthook/husky/lint-staged/.git/hooks — run even if not installed), CI validation steps (.github/workflows etc.). Fix failures first. Never commit red. Full rules: commit skill.
