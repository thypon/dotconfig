CRITICAL WARNING: MAX CONTEXT LIMIT REACHED

At or beyond configured max context threshold. Emergency context-recovery moment.

MUST use `compress` tool now. No normal exploration until compression handled.

Mid critical atomic operation → finish atomic step first, then compress immediately.

SELECTION PROCESS
Start from older, resolved history. Capture as much stale context as safely possible in one pass.
Avoid newest active working messages unless clearly closed.

SUMMARY REQUIREMENTS
Summary MUST cover all essential details from selected messages so work can continue.
Compressed range includes user messages → preserve user intent exactly. Prefer direct quotes for short user messages to avoid semantic drift.

GROUNDING SEARCH
Context exhaustion often follows failed loops. After compressing, run fresh `brave_websearch`.
Derive query from unresolved issues, errors, failed attempts in compressed range.
Goal: ground with already-researched solution instead of resuming same loop.
Skip search only when no unresolved problem preceded compression.