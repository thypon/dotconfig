---
description: Dry security review of current changes
model: dynamic/antagonist_model
---

/security-review $ARGUMENTS

Analyze current git diff for security vulnerabilities. Terse. No fluff. Fragments OK.

Cover: injection (SQL/NoSQL/command), XSS, SSRF, path traversal, authZ/authN gaps, data exposure, secret leakage, unsafe deserialization, weak crypto, race conditions.

Format: <file>:L<line>: <severity>: <vulnerability>. <fix>.

Severity: bug (critical), risk (fragile), nit (minor).