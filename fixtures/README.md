# Phase Gate Fixtures

Each phase must record 17 distinct, public, third-party works. A fixture is counted only when
its GenLayer transaction reaches `FINALIZED`, execution succeeds, the verdict schema validates,
and Base settlement matches the expected golden outcome.

Fixture records are JSON Lines with: `id`, `phase`, `sourceUrls`, `pinnedRevision`,
`expectedDecision`, `genlayerTxHash`, `baseTxHash`, `reviewer`, and `completedAt`.

No release gate is currently claimed. Candidate sources must be manually reviewed and pinned
before use; the project never creates or modifies third-party repositories for fixture testing.
