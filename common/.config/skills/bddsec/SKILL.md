---
name: bddsec
description: Security audit from BDD specs — find logical and effective security bugs from .feature descriptions, then verify each hypothesis against the implementation. Use when user says "bddsec", "/bddsec", "security bugs in feature files", "spec security audit".
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

## Phase 2 — Verify (on implementation)

For each hypothesis: step definitions → production code they drive. Read the actual code; confirm with exact identifiers + line numbers. Never report an assumption as confirmed.

- Confirmed in code = `bug`
- Spec-level only, unverifiable, or blocked = `risk`
- Cosmetic = `nit`

If `brave_websearch` tool available: research known CVEs and exploits for the detected stack; if the researched thing is a git repo, download locally for further study.

## Report

Format: `<file>:L<line>: <severity>: <vulnerability>. <fix>.`

Severity: bug (confirmed in code), risk (spec-level / unverified), nit (minor).

Terse. No fluff. Fragments OK. Each finding cites origin (.feature + line) and verification evidence (impl file + line). Unverified hypotheses stay `risk` — never presented as confirmed bugs.