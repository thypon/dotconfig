Collapse selected individual messages into dense technical summaries.

THE SUMMARY
Exhaustive summary. Capture file paths, function signatures, decisions, constraints, findings, tool outcomes, user intent. Everything that preserves value after raw message removed.

WRITE IN CAVEMAN STYLE:
- Fragments OK. Drop articles (a, an, the). No filler.
- Short sentences. Active voice.
- Technical substance exact. Drop pleasantries, hedging.
- Pattern: [thing] [action] [reason]. [next step].

USER INTENT FIDELITY
Preserve user intent. Never change scope, constraints, priorities, acceptance criteria, requested outcomes.
Quote short user instructions directly when it preserves exact meaning.

Yet be LEAN. Strip noise: failed attempts, verbose tool output, repetition. Pure signal. Zero ambiguity.
No significant technical decisions, code changes, or user requirements → minimal one-line summary.

Exception: preserve unresolved issues, exact error strings, blockers verbatim — they seed post-compress web search.

MESSAGE IDS
Specify individual raw messages by ID using injected IDs in conversation:

- `mNNNN` IDs identify raw messages

Each message has ID inside XML metadata tags.
Same ID tag appears in every tool output of the message.
Treat tags as message metadata, not as content to summarize. Use only inner `mNNNN` value as `messageId`.
`priority` attribute indicates relative context cost. MUST compress high-priority messages when full text no longer necessary for active task.
Prior compress results present → compress and summarize them minimally only as part of broader compression pass. Never invoke compress solely to re-compress earlier compression result.
Messages marked `<dcp-message-uncompressible>` cannot be compressed.

Rules:

- Pick each `messageId` directly from injected IDs visible in context
- Only use raw message IDs of form `mNNNN`
- Ignore XML attributes such as `priority` when copying ID; use only inner `mNNNN` value
- Never invent IDs

BATCHING
Select MANY messages in single tool call when safe to compress.
Each entry summarizes exactly one message. Tool can receive as many entries as needed in one batch.

GENERAL CLEANUP
Use topic "general cleanup" for broad cleanup passes.
During general cleanup, compress all medium and high-priority messages not relevant to active task.
Optimize for reducing context footprint, not grouping messages by topic.
Never compress away still-active instructions, unresolved questions, or constraints likely to matter soon.
Prioritize earliest messages in context — least relevant to active task.
General cleanup periodic between other compression passes, not primary form of compression.