---
description: Dry security review of current changes
argument-hint: <extra-args>
---

/security-review $@

Analyze current git diff for security vulnerabilities. Terse. No fluff. Fragments OK.

If `brave_websearch` tool available, use it to research CVEs, known vulnerabilities, and exploit details relevant to changed code. If researched thing is git repository, download locally for further research.

Cover: injection (SQL/NoSQL/command), XSS, SSRF, path traversal, authZ/authN gaps, data exposure, secret leakage, unsafe deserialization, weak crypto, race conditions.

Format: <file>:L<line>: <severity>: <vulnerability>. <fix>.

Severity: bug (critical), risk (fragile), nit (minor).