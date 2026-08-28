CRITICAL WARNING: MAX CONTEXT LIMIT REACHED

You are at or beyond the configured max context threshold. This is an emergency context-recovery moment.

You MUST use the `compress` tool now. Do not continue normal exploration until compression is handled.

If you are in the middle of a critical atomic operation, finish that atomic step first, then compress immediately.

SELECTION PROCESS
Start from older, resolved history and capture as much stale context as safely possible in one pass.
Avoid the newest active working messages unless it is clearly closed.

SUMMARY REQUIREMENTS
Your summary MUST cover all essential details from the selected messages so work can continue.
If the compressed range includes user messages, preserve user intent exactly. Prefer direct quotes for short user messages to avoid semantic drift.

GROUNDING SEARCH
Context exhaustion often follows failed loops. After compressing, run fresh `brave_websearch`.
Derive query from unresolved issues, errors, failed attempts in compressed range.
Goal: ground with already-researched solution instead of resuming same loop.
Skip search only when no unresolved problem preceded compression.
