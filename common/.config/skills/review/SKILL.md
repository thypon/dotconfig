---
name: review
description: "Expert code review of current git changes with a senior engineer lens. Detects SOLID violations, security risks, and proposes actionable improvements."
metadata:
  model: dynamic/model
---

# Code Review Expert

## Overview

Perform a structured review of the current git changes with focus on SOLID, architecture, removal candidates, and security risks. Default to review-only output unless the user asks to implement changes.

**Output style: caveman.** Terse. No fluff. Fragments OK. Drop articles, pleasantries, hedging. One finding = one line: `<file>:L<line>: <severity>: <problem>. <fix>.`

## Severity Levels

| Level | Name | Description | Action |
|-------|------|-------------|--------|
| **bug** | Critical | Security vulnerability, data loss risk, correctness bug | Must block merge |
| **risk** | High | Logic error, SOLID violation, performance regression, race | Should fix before merge |
| **nit** | Medium | Code smell, maintainability concern, minor SOLID violation | Fix in this PR or create follow-up |
| **q** | Low | Style, naming, minor suggestion, genuine question | Optional improvement |

## Workflow

### 1) Preflight context

- Use `git status -sb`, `git diff --stat`, and `git diff` to scope changes.
- If needed, use `rg` or `grep` to find related modules, usages, and contracts.
- Identify entry points, ownership boundaries, and critical paths (auth, payments, data writes, network).

**Edge cases:**
- **No changes**: If `git diff` is empty, inform user and ask if they want to review staged changes or a specific commit range.
- **Large diff (>500 lines)**: Summarize by file first, then review in batches by module/feature area.
- **Mixed concerns**: Group findings by logical feature, not just file order.

### 2) SOLID + architecture smells

- Load `references/solid-checklist.md` for specific prompts.
- Look for:
  - **SRP**: Overloaded modules with unrelated responsibilities.
  - **OCP**: Frequent edits to add behavior instead of extension points.
  - **LSP**: Subclasses that break expectations or require type checks.
  - **ISP**: Wide interfaces with unused methods.
  - **DIP**: High-level logic tied to low-level implementations.
- When you propose a refactor, explain *why* it improves cohesion/coupling and outline a minimal, safe split.
- If refactor is non-trivial, propose an incremental plan instead of a large rewrite.

### 3) Removal candidates + iteration plan

- Load `references/removal-plan.md` for template.
- Identify code that is unused, redundant, or feature-flagged off.
- Distinguish **safe delete now** vs **defer with plan**.
- Provide a follow-up plan with concrete steps and checkpoints (tests/metrics).

### 4) Security and reliability scan

- Load `references/security-checklist.md` for coverage.
- Check for:
  - XSS, injection (SQL/NoSQL/command), SSRF, path traversal
  - AuthZ/AuthN gaps, missing tenancy checks
  - Secret leakage or API keys in logs/env/files
  - Rate limits, unbounded loops, CPU/memory hotspots
  - Unsafe deserialization, weak crypto, insecure defaults
  - **Race conditions**: concurrent access, check-then-act, TOCTOU, missing locks
- Call out both **exploitability** and **impact**.

### 5) Code quality scan

- Load `references/code-quality-checklist.md` for coverage.
- Check for:
  - **Error handling**: swallowed exceptions, overly broad catch, missing error handling, async errors
  - **Performance**: N+1 queries, CPU-intensive ops in hot paths, missing cache, unbounded memory
  - **Boundary conditions**: null/undefined handling, empty collections, numeric boundaries, off-by-one
- Flag issues that may cause silent failures or production incidents.

### 6) Output format

**Format:** `<file>:L<line>: <severity>: <problem>. <fix>.`

**Severity:**
- `bug:` — broken behavior, will cause incident
- `risk:` — works but fragile (race, missing null check, swallowed error)
- `nit:` — style, naming, micro-optim. Author can ignore
- `q:` — genuine question, not a suggestion

**Drop:** "I noticed that...", "It seems like...", "You might want to...", "This is just a suggestion but...", restating what line does, hedging ("perhaps", "maybe", "I think").

**Keep:** exact line numbers, exact symbol/function/variable names in backticks, concrete fix, the *why* if fix not obvious from problem.

**Auto-clarity:** Drop terse for: security findings (CVE-class needs full explanation), architectural disagreements (need rationale), onboarding contexts (author new, needs "why"). Normal paragraph then resume terse.

**Header:**
```
Files: X, Lines: Y | Verdict: APPROVE/REQUEST_CHANGES/COMMENT
```

**Clean review:** state what checked, what skipped, residual risk.

### 7) Next steps

```
X issues: bug:_, risk:_, nit:_, q:_
Fix all / Fix bugs+risks / Fix specific / No changes?
```

Do NOT implement until user confirms.

## Resources

### references/

| File | Purpose |
|------|---------|
| `solid-checklist.md` | SOLID smell prompts and refactor heuristics |
| `security-checklist.md` | Web/app security and runtime risk checklist |
| `code-quality-checklist.md` | Error handling, performance, boundary conditions |
| `removal-plan.md` | Template for deletion candidates and follow-up plan |
