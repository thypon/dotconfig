---
description: Generate terse commit message
argument-hint: <extra-args>
metadata:
  model: dynamic/small_model
policy-allow:
  - mach:com.apple.trustd.agent
  - unix-socket:$SSH_AUTH_SOCK
---

/commit $@

Generate a commit message and commit it. Use conventional commits format.

Validation gate mandatory before commit: run all Makefile lint/typecheck/test/build targets, ALL git hooks of whatever framework the project uses (pre-commit/lefthook/husky/lint-staged/.git/hooks — run them even if not installed), and the validation steps defined in the CI config (.github/workflows etc). Fix failures first, never commit red. Checks needing external secrets/infra → report and ask before committing.

Whenever you change your mind or pivot, redo ground truth research based on what you discovered in your thought process. Use search tools and the internet.

If you find an error during implementation, investigate it more (explore agents, codebase search), then search the internet for what might be the problem before fixing.

When solving a known problem, reuse an existing proven solution instead of inventing your own.