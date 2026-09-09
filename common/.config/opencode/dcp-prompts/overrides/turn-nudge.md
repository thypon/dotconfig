Evaluate conversation for compressible ranges.

Messages cleanly closed and unlikely to be needed again → use compress tool on them.
Direction shifted → compress earlier ranges now less relevant.

Goal: filter noise, distill key information, keep context accumulation under control.
Keep active context uncompressed.

GROUNDING SEARCH
Compression hides unresolved problems (errors, failed attempts, blockers) → run fresh `brave_websearch` after compressing.
Derive query from those issues. Routine closed-section cleanup: no search needed.