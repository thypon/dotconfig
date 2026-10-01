---
name: bddsec
description: Security audit from BDD specs — find logical and effective security bugs from .feature descriptions, verify each hypothesis against the implementation, then exploit-test findings dynamically (runtime probes up to end-to-end, non-destructive). Use when user says "bddsec", "/bddsec", "security bugs in feature files", "spec security audit".
---

# BDD Spec Security Audit

Read all `**/*.feature` files in the repo. `$ARGUMENTS` = optional scope filter (path or glob). None found → report and stop.

## Phase 1 — Hypothesize (from descriptions)

Specs describe intended behavior; missing or implied behavior is the attack surface. Derive candidate security bugs from scenario text, two classes:

**Logical** (spec-level flaws):
- missing authN/authZ steps — scenario never checks who is allowed
- implied unvalidated input — Given/When feeds user data straight into an action
- unsafe defaults, trust-boundary crossings without a guard step
- attacker-controlled edge cases left unspecified (empty, huge, unicode, negative, concurrent, replayed)
- secrets/state exposure implied by Then clauses

**Effective** (behavior plausibly exploitable in the implementation):
- privileged operations reachable from public scenarios
- validation skipped on alternate paths the spec implies
- race/TOCTOU-prone step sequences

Rank hypotheses by exploitability. Discard fantasy before verifying.

## Phase 2 — Verify (static)

For each hypothesis: step definitions → production code they drive. Read the actual code; confirm with exact identifiers + line numbers. Never report an assumption as confirmed.

- Confirmed in code = `bug` (final status set in Phase 3)
- Spec-level only, unverifiable, or blocked = `risk`
- Cosmetic = `nit`

If `brave_websearch` tool available: research known CVEs and exploits for the detected stack; if the researched thing is a git repo, download locally for further study.

## Phase 3 — Exploit-test (dynamic, up to E2E)

Mandatory best-effort for EVERY finding (bugs AND risks). Escalate tiers, stop when proven or tier exhausted.

Tiers:
1. Harness — run the project's own BDD/test runner with attacker-shaped step data (other user's ID, oversized/unicode/negative values, replayed request).
2. Runtime — invoke the vulnerable component directly (script/REPL importing it, real payload).
3. E2E — start the real app (Makefile target, package.json script, docker compose, main binary) in an isolated env; drive the attack over its real interface (curl, CLI). Preferred for HTTP/CLI-exposed flows when the app starts cleanly; tiers 1–2 for internals.

Rules:
- Non-destructive only: read-only probes, dry-runs, disposable envs (docker, orbstack VM, tmp DB). Never production, never mutate/destroy real data. Prove capability, not damage: authz bypass → read another user's resource, not delete; injection → `SELECT 1`/version/sleep; XSS → harmless marker.
- One probe per finding. Capture exact command + observed evidence (request/response, exit code, timing).
- Cleanup: stop servers, remove tmp state.
- Untestable (no runnable env, needs creds/infra, destructive-only proof) → record reason, fall back to static evidence. Never fake execution.
- Static bug, probe behaves safely → stays bug, mark `not reproduced`.
- Risk proven live → promotes to `bug (live-verified)`.

## Report

Format: `<file>:L<line>: <status>: <vulnerability>. <fix>.`

Status: `bug (live-verified)` (dynamically reproduced), `bug (code-verified)` (static only — untested / not reproduced / untestable, with reason), `risk` (spec-level / unverified), `nit` (minor). Statuses map 1:1 to bddreport's `Code-verified` / `**Live-verified**` / `Not executed (reason)`.

Terse. No fluff. Fragments OK. Each finding cites origin (.feature + line), verification evidence (impl file + line), and for live-tested findings the exact probe command + observed output. Unverified hypotheses stay `risk` — never presented as confirmed bugs.