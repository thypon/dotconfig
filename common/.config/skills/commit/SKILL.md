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

## Workflow

1. Run `git status` and `git diff` (with `--stat` or full diff as needed) to understand changes
2. Generate terse Conventional Commits message
3. Run `git add` on relevant changed files (only intended changes, never secrets or temp files)
4. Run `git commit -m "message"` with generated message

"stop commit" or "normal mode": revert to verbose commit style.
