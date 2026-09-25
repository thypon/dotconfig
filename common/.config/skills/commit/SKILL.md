---
name: commit
description: Conventional Commits generator, ≤50-char subject, why-only body. Use when user says "write a commit", "commit message", "/commit", or stages changes.
metadata:
  model: dynamic/small_model
---

Write commit messages terse and exact. Conventional Commits format. No fluff. Why over what.

## Rules

**Subject line:**
- `<type>(<scope>): <imperative summary>` — `<scope>` optional
- Types: `feat`, `fix`, `refactor`, `perf`, `docs`, `test`, `chore`, `build`, `ci`, `style`, `revert`
- Imperative mood: "add", "fix", "remove" — not "added", "adds", "adding"
- ≤50 chars when possible, hard cap 72
- No trailing period
- Match project convention for capitalization after colon

**Body (only if needed):**
- Skip when subject self-explanatory
- Body only for: non-obvious *why*, breaking changes, migration notes, linked issues
- Wrap 72 chars
- Bullets `-` not `*`
- Reference issues/PRs at end: `Closes #42`, `Refs #17`

**What NEVER goes in:**
- "This commit does X", "I", "we", "now", "currently" — diff says what
- "As requested by..." — use Co-authored-by trailer
- "Generated with Claude Code" or any AI attribution
- Emoji (unless project convention requires)
- Restating file name when scope already says it

## Examples

Diff: new endpoint for user profile with body explaining the why
- ❌ "feat: add a new endpoint to get user profile information from the database"
- ✅
  ```
  feat(api): add GET /users/:id/profile

  Mobile client needs profile data without the full user payload
  to reduce LTE bandwidth on cold-launch screens.

  Closes #128
  ```

Diff: breaking API change
- ✅
  ```
  feat(api)!: rename /v1/orders to /v1/checkout

  BREAKING CHANGE: clients on /v1/orders must migrate to /v1/checkout
  before 2026-06-01. Old route returns 410 after that date.
  ```

## Auto-Clarity

Always include body for: breaking changes, security fixes, data migrations, anything reverting a prior commit. Never compress into subject-only — future debuggers need context.

## Validation Gate — MANDATORY

Never commit red. Before `git add`/`git commit`: discover the project's validation surface, run everything, fix all failures, re-run until green.

**1. Makefile targets** (skip silently if no Makefile):
- Read the Makefile. Run lint/typecheck/test/build targets: `lint*`, `check`, `validate`, `typecheck`, `test`, `build`
- Side effects unclear → `make -n <target>` dry-run first
- Never run `clean`/`deploy`/`release`/`publish` targets

**2. Git hooks — run even if not installed** (skip silently if none):
Detect which hook framework the project uses from its config, run ALL its checks with that tool:
- `.pre-commit-config.yaml` → `pre-commit run --all-files` (works without `pre-commit install`; binary missing → `uvx pre-commit run --all-files`)
- `lefthook.yml` / `.lefthook*` → `lefthook run pre-commit --all` (missing binary → `npx lefthook run pre-commit --all`)
- `.husky/` → run `.husky/pre-commit` script directly (it usually drives `lint-staged`)
- `simple-git-hooks` / `lint-staged` config in `package.json` → run the configured commands
- plain `.git/hooks/pre-commit` / `.git/hooks/pre-push` executables → run directly
- Never assume hooks fire automatically — uninstalled hooks do not run on `git commit`; run them explicitly

**3. CI validation steps** (skip silently if no CI config):
- Read `.github/workflows/*.yml` (also `.gitlab-ci.yml`, `.circleci/config.yml`, `.woodpecker/`, `Jenkinsfile`, `azure-pipelines.yml`, `.drone.yml`)
- Run every locally-runnable validation job: lint, typecheck, test, build
- Skip deploy/publish/release/infra jobs

**Fix loop:** failure → investigate root cause → fix → re-run the failed check. All green → proceed to commit. Never bypass: no `--no-verify`, no `continue-on-error`, no deleting/skipping checks.

**Non-runnable checks** (external secrets, real infra, deploy keys): report explicitly, commit only after user confirms.

## Workflow

1. Run `git status` and `git diff` (with `--stat` or full diff as needed) to understand changes
2. Run Validation Gate (above) — all checks green before continuing
3. Generate terse Conventional Commits message
4. Run `git add` on relevant changed files (only intended changes, never secrets or temp files)
5. Run `git commit -m "message"` with generated message

"stop commit" or "normal mode": revert to verbose commit style.
