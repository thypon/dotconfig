---
name: bddreport
description: Generate a security pentest report (pentest-report.md + per-finding repro/ dir + zip) from BDD spec security audit findings (bddsec output). Use when user says "bddreport", "/bddreport", "pentest report from BDD", "generate security report".
---

# BDD Pentest Report Generator

Turns bddsec-style findings into the canonical deliverable: `pentest-report.md`, `repro/` dir (one file per finding), `pentest-report.zip`. `$ARGUMENTS` = optional target scope / output dir (default: repo root).

## Input

Findings must be evidence-backed. In order of preference:
1. bddsec audit results already in this conversation (bugs/risks/nits with file:line evidence).
2. No findings present → run the bddsec skill first (Phase 1 hypothesize + Phase 2 verify static + Phase 3 exploit-test), then report.

Never invent findings. No verified evidence for a finding → it stays a `risk`, marked as such.

## ID + status conventions

- `B<n>` = bug (confirmed in code). `R<n>` = risk (spec-level / unverified / not exploitable standalone). Number each series from 1 in the order listed in the severity summary.
- Severity: High / Medium / Low (map bddsec bug/risk/nit + real-world impact; nits are never findings — they go to Appendix A).
- Status values: `Code-verified`, `**Live-verified**` (probe executed once, non-destructive), `Not executed (disruptive)`, `Not executed (costly)`, `Code-verified (not executed — requires creds)`. Destructive/costly repros may be written but never executed; say so explicitly.

## pentest-report.md skeleton

```markdown
# Security Pentest Report — <target> (spec-driven BDD audit)

- **Date:** YYYY-MM-DD
- **Scope:** <components audited>. N BDD `.feature` files (~N Gherkin lines) audited against their implementations.
- **Method:** Spec-driven security audit (`bddsec`): security hypotheses derived from Gherkin specs (missing authN/authZ, unvalidated input, trust-boundary gaps, race/replay, audit gaps), each verified against production code to exact file:line. <note live probes executed or not>
- **Environments:** <hosts/instances used for live verification, if any>
- **Reproduction steps:** one file per finding in `repro/`, referenced below. <define env vars used, e.g. $ADMIN>

## Severity summary

| ID | Severity | Finding | Location (rel. <root>) | Status |
|----|----------|---------|------------------------|--------|

---

## Findings

### <ID> — <Severity>: <title>

- **Origin:** `<feature>.feature:L<line>` ("<scenario name>")
- **Location:** `<impl file>:L<lines>`; evidence: `<supporting file>:L<lines>`
- **Description:** <what the code does, why it is a flaw, why tests miss it>
- **Impact:** <concrete attacker capability / compliance framing>
- **Remediation:** <specific fix, cite the correct in-repo pattern if one exists>
- **Reproduction:** `repro/<ID>-<slug>.md`
```

Findings ordered B-series then R-series, High→Low within each. Title = one-line vulnerability statement. Description cites exact identifiers/lines; live-verified findings embed the observed evidence (request/response, timing) inline.

## Appendices (all optional, include when non-empty)

```markdown
## Appendix A — Nits (not counted as findings)

| Location | Note |
|---|---|

## Appendix B — Dependency advisories (applicability-checked)

| Package (locked) | Advisory | Fix | Applicability |
|---|---|---|---|

## Appendix C — Hypotheses tested and discarded (evidence available on request)

<comma-separated list of discarded hypotheses>
```

Appendix B: only from actual lockfile/dep scan; every advisory gets an applicability verdict (e.g. "Not applicable (no X used)"). Appendix C: prevents re-litigating dead ends; list every hypothesis considered and discarded, with reason if non-obvious.

## repro/<ID>-<slug>.md format

```markdown
# <ID> — <title> — <Severity>

**Requires:** <creds/prereqs>
**Endpoint:** <method + path + host>
**Status:** <code-verified | live-verified | not executed — reason>

1. <numbered, copy-pasteable steps; exact curl/python>
2. ...
N. Observe <expected result proving the vuln>.

**Root cause:** <file:line citation + one-line mechanism>
```

Every repro self-contained: required creds, exact commands, expected observable result, root-cause citation.

## Packaging

```sh
zip -r pentest-report.zip pentest-report.md repro/
```

Verify with `unzip -l` (1 report + N repro files). Then report counts: N bugs, N risks, N nits; which findings live-verified; zip path.
