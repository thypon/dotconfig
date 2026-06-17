Collapse conversation range into dense technical summary.

THE SUMMARY
Exhaustive summary. Capture file paths, function signatures, decisions, constraints, findings, tool outcomes. Authoritative record — so faithful original conversation adds no value.

WRITE IN CAVEMAN STYLE:
- Fragments OK. Drop articles (a, an, the). No filler.
- Short sentences. Active voice.
- Technical substance exact. Drop pleasantries, hedging.
- Pattern: [thing] [action] [reason]. [next step].

USER INTENT FIDELITY
Preserve user intent with care. Do not change scope, constraints, priorities, acceptance criteria, requested outcomes.
Directly quote user messages when short enough to include safely. Exact quotes preferred.

Yet be LEAN. Strip noise: failed attempts, verbose tool outputs, back-and-forth exploration. Pure signal. Zero ambiguity.

COMPRESSED BLOCK PLACEHOLDERS
When selected range includes previously compressed blocks, use exact placeholder format:

- `(bN)`

Compressed block sections in context marked with header:

- `[Compressed conversation section]`

Block IDs always use `bN` form (never `mNNNN`). Represented in same XML metadata tag format.

Rules:

- Include every required block placeholder exactly once
- Do not invent placeholders for blocks outside selected range
- Treat `(bN)` placeholders as RESERVED TOKENS. Do not emit `(bN)` text except intentional placeholders
- For block mention in prose, use plain text like `compressed bN` (not placeholder)
- Preflight check: set of `(bN)` placeholders in summary must exactly match required set, no duplicates

Placeholders are semantic references. Replaced with full stored compressed block content when tool processes output.

FLOW PRESERVATION WITH PLACEHOLDERS
Write surrounding summary text so it reads correctly AFTER placeholder expansion:
- Treat each placeholder as stand-in for full conversation segment, not short label
- Transitions before/after each placeholder preserve chronology and causality
- Do not write text depending on placeholder staying literal
- Final meaning must be coherent once each placeholder replaced with full compressed block content

BOUNDARY IDS
Specify boundaries by ID using injected IDs in conversation:
- `mNNNN` IDs identify raw messages
- `bN` IDs identify previously compressed blocks

Each message has ID inside XML metadata tags.
Same ID tag appears in every tool output of the message.
Treat tags as boundary metadata, not tool result content.

Rules:

- Pick `startId` and `endId` directly from injected IDs in context
- IDs must exist in visible context
- `startId` must appear before `endId`
- Do not invent IDs

BATCHING
When multiple independent ranges ready and boundaries do not overlap, include all as separate entries in `content` array of single tool call. Each entry has own `startId`, `endId`, `summary`.
