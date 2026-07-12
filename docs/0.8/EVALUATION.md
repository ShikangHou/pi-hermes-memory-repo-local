# v0.8 Evaluation

Local verification on 2026-07-12 used Node 22.23.1 on macOS:

- `npm run check`: passed.
- Focused Phase 3 tests: 30/30 passed.
- Focused Phase 4 tests: 35/35 passed.
- Focused Phase 5/storage tests: 65/65 passed.
- Full suite after privacy migration and metric gates: all 52 test files passed.

Covered regression scenarios include same-named Workspace isolation, malicious Markdown quarantine, manual reconciliation, 100 concurrent writes, correction/failure priority, Global/Workspace quota sharing, generic router skips, strict budgets, compaction deduplication, and SQLite corruption recovery.

`evaluateMemoryRetrieval()` reports Workspace leakage, dangerous injection, duplicate observations, precision@K, router false-positive/false-negative rates, average characters/tokens, P50/P95 latency, and Markdown/SQLite divergence. `assertReleaseSafety()` makes leakage, dangerous injection, duplicate observation, and divergence zero-tolerance release gates.

The CI matrix runs Node 20 and 22 on Linux, macOS, and Windows. Remote CI results are required before promoting this release candidate to stable.
