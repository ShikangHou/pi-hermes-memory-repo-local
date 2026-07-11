# v0.8 Plan: Trusted, Explainable, Automatic Workspace Memory

## 1. Goal

Upgrade the current Markdown + SQLite memory system into a trusted, explainable, automatically retrieved Workspace memory pipeline:

```text
Trusted Workspace identity
  -> safe unified write/import validation
  -> idempotent observation and indexing
  -> on-demand retrieval
  -> ranking, filtering, and budgeted packing
  -> explainable injection
  -> automatic Markdown/SQLite repair
```

Primary goals:

1. Eliminate cross-Workspace memory leakage.
2. Prevent Markdown and Git-controlled content from bypassing safety checks.
3. Prevent concurrent writes from losing memory entries.
4. Keep Markdown and SQLite eventually consistent.
5. Add low-cost, optional automatic retrieval.
6. Bound retrieval token usage.
7. Explain why each memory was retrieved or excluded.
8. Remain local-first without requiring a daemon or external service.

## 2. Non-Goals

This release does not:

- Require a standalone daemon.
- Require a cloud service or remote API.
- Enable embeddings by default.
- Add an external graph database such as Neo4j or Kuzu.
- Remove Markdown as the human-readable source of truth.
- Restore full-memory prompt injection as the default.
- Automatically commit `.pi/` data to Git.

## 3. Implementation Order

```text
Phase 0  Baseline and documentation alignment
Phase 1  Security boundary and Workspace identity
Phase 2  Concurrent writes and dual-store consistency
Phase 3  Observation and compaction checkpoints
Phase 4  Router, ranking, and budgeted packing
Phase 5  Automatic retrieval and explainability
Phase 6  Privacy, migration, evaluation, and release
```

Automatic retrieval must not be enabled until the security and data-correctness phases are complete.

---

## Phase 0: Baseline and Documentation Alignment

### Tasks

- [x] Update the root `AGENTS.md`:
  - Replace the obsolete v0.2 status with the current v0.7/v0.8 status.
  - Remove the obsolete "No SQLite" design note.
  - Document global and repo-local storage paths.
  - Update the entry point and core-module list.
- [x] Update `docs/ROADMAP.md` to reflect the actual state of v0.2-v0.7.
- [x] Record a v0.8 baseline test result in `docs/0.8/BASELINE.md`.
- [x] Document the Node, macOS, Linux, and Windows compatibility matrix.
- [x] Declare supported Node and Pi version ranges.

### Acceptance Criteria

- Repository instructions match the current implementation.
- Type checking passes.
- All non-SQLite tests pass.
- A native SQLite installation failure produces a clear error or documented degraded mode.

---

## Phase 1: Security Boundary and Workspace Identity

### Epic 1.1: Unified Memory Validation

Add:

```text
src/security/memory-validation.ts
src/security/memory-quarantine.ts
```

Every content entry point must use the same validation pipeline:

- `memory` tool add/replace.
- Background review.
- Correction detection.
- Consolidation output.
- Startup Markdown backfill.
- `/memory-sync-markdown`.
- Repo-local `.pi/MEMORY.md`.
- Data migrations.
- Retrieved content before prompt injection.

Suggested interface:

```ts
interface ValidationResult {
  accepted: boolean;
  normalizedContent?: string;
  secretMatches: string[];
  injectionMatches: string[];
  action: "accept" | "reject" | "quarantine";
}

validateMemoryContent(content, {
  source,
  trustLevel,
  phase: "write" | "import" | "recall",
}): ValidationResult;
```

Rules:

- Credentials, private keys, and tokens are rejected.
- Explicit prompt-injection content is quarantined.
- Git-controlled and manually imported content is untrusted by default.
- Quarantined content never enters automatic retrieval.
- Users can inspect and delete quarantined entries.

Add commands:

```text
/memory-quarantine
/memory-quarantine-delete <id>
```

### Epic 1.2: Stable Workspace Identity

Introduce a single Workspace model:

```ts
interface ActiveWorkspace {
  id: string;
  displayName: string;
  rootDir: string;
  memoryDir: string;
  source: "workspace-marker" | "legacy-marker" | "git";
}
```

Rules:

- SQLite isolation uses only `workspaceId`.
- `displayName` is used only for UI.
- Tools cannot accept a model-provided concrete Workspace ID.
- `cwd`, Workspace ID, and paths come from the Pi runtime.
- The ID in `.pi/workspace.json` takes precedence.
- Without a marker, derive a stable ID from the canonical Git root.
- Repositories with the same directory name remain isolated.

Database migration:

```sql
ALTER TABLE memories ADD COLUMN workspace_id TEXT;
ALTER TABLE memories ADD COLUMN workspace_name TEXT;
ALTER TABLE sessions ADD COLUMN workspace_id TEXT;
```

Keep the legacy `project` field for one compatibility cycle.

### Epic 1.3: Dynamic Workspace Context

Add:

```text
src/workspace/workspace-context-provider.ts
```

Refresh the active context on:

- `session_start`.
- `resources_discover`.
- Before tool execution.
- A cwd-change event, if supported by Pi.

Memory, Skills, Search, Review, Correction, Preview, and Consolidation must all read the same active context. They must not capture an initialization-time `projectName`.

### Acceptance Criteria

- Two same-named repositories have fully isolated SQLite memories.
- Renaming a Workspace does not lose memories when its marker ID is stable.
- Changing cwd during a running process cannot write to the previous Workspace.
- A malicious `.pi/MEMORY.md` entry cannot enter retrieval results.
- Every import path has security tests.

---

## Phase 2: Concurrent Writes and Dual-Store Consistency

### Epic 2.1: Serialized MemoryStore Writes

Add a per-store write queue or mutex:

```ts
store.withWriteLock(async () => {
  await store.reloadIfChanged();
  // add / replace / remove / consolidate
  await store.commit();
});
```

Cover:

- Add.
- Replace.
- Remove.
- FIFO eviction.
- Consolidation.
- Migration.
- Background review.
- Correction saves.

Use a lock file or optimistic file-version/hash check for cross-process consolidation.

### Epic 2.2: Stable Memory IDs

Add stable IDs to Markdown entries:

```markdown
Memory content
<!-- id=mem_01J..., created=..., updated=..., last=... -->
```

Extend SQLite:

```sql
ALTER TABLE memories ADD COLUMN memory_uid TEXT;
ALTER TABLE memories ADD COLUMN source_file TEXT;
ALTER TABLE memories ADD COLUMN source_hash TEXT;
CREATE UNIQUE INDEX ... ON memories(memory_uid);
```

CRUD must prefer IDs. Substring matching remains only as a compatibility interface.

### Epic 2.3: Markdown/SQLite Reconciliation

Add:

```text
src/store/memory-reconciler.ts
src/store/memory-sync-state.ts
```

Track:

- File path.
- Size and mtime.
- Content hash.
- Last synchronization time.
- Synchronization errors.
- SQLite revision.

At startup:

1. Inspect only changed files.
2. Import the active repo-local Workspace.
3. Validate every entry.
4. Synchronize inside a transaction.
5. Remove or mark mirror rows that disappeared from Markdown.

Add commands:

```text
/memory-doctor
/memory-repair
```

`/memory-doctor` checks:

- Markdown/SQLite divergence.
- Duplicate IDs.
- Orphaned SQLite rows.
- FTS inconsistencies.
- Incorrect Workspace assignments.
- Quarantined content.
- Oversized entries.

### Acceptance Criteria

- 100 concurrent adds lose no entries.
- Add and consolidation cannot overwrite each other.
- Manual repo-local Markdown edits are reindexed automatically.
- Deleted Markdown entries disappear from search.
- Repair is idempotent.

---

## Phase 3: Observation and Compaction Checkpoints

### Epic 3.1: Separate Observation from Extraction

Separate the system into:

```text
Observation Pipeline
Memory Extraction Pipeline
Recall Pipeline
```

Observation reliably records:

- User messages.
- Assistant messages.
- Tool calls.
- Tool results.
- Session and cwd.
- Compaction boundaries.

Extraction produces:

- Corrections.
- Failures.
- Conventions.
- Preferences.
- Insights.
- Skill candidates.

Archiving must not depend on successful LLM extraction.

### Epic 3.2: Pi Custom-Entry Checkpoints

Use Pi custom entries for lightweight cursors:

```ts
interface MemoryCheckpoint {
  version: 1;
  workspaceId: string | null;
  lastObservedEntryId: string;
  lastObservedSequence: number;
  lastFlushId?: string;
  lastCompactionId?: string;
}
```

Do not store complete memories in custom entries.

### Epic 3.3: Two-Phase Compaction

```text
session_before_compact
  -> flush unobserved messages
  -> create before checkpoint
  -> extract candidate memories

compaction completed
  -> create after checkpoint
  -> record token delta
  -> mark the archived message range
```

The same compacted message range must never be extracted twice.

### Acceptance Criteria

- Resuming a session indexes only new messages.
- Duplicate `message_end` and shutdown events do not duplicate observations.
- One compaction does not generate duplicate memories.
- Extraction failure does not affect raw session indexing.

---

## Phase 4: Router, Ranking, and Budgeted Packing

This phase continues v0.7 Epics 2-3.

### Epic 4.1: Deterministic Memory Router

Add:

```text
src/handlers/memory-router.ts
```

Retrieve on signals such as:

- Prior-context language: "previously", "last time", "remember", "continue", or "same issue".
- Repository paths, configuration files, and package names.
- Test, build, CI, and deployment failures.
- Preference-sensitive work.
- Current tool failures.
- Project conventions and architecture decisions.

Skip retrieval for:

- Generic knowledge questions.
- One-off examples unrelated to the active Workspace.
- Translation and simple formatting transformations.
- Tasks where durable context cannot improve the result.

The first implementation must be heuristic and must not call an LLM.

### Epic 4.2: Unified Candidate Ranking

Use a transparent score:

```text
finalScore =
  bm25Score
  + workspaceBoost
  + categoryBoost
  + recencyScore
  + confidenceScore
  + graphScore
  - stalePenalty
  - conflictPenalty
```

Priority order:

1. Current-Workspace corrections.
2. Failures and tool quirks matching the current error.
3. Current-Workspace conventions.
4. Relevant user preferences.
5. Global insights.

Merge Global and Workspace candidates before sorting. Global results must not consume the entire limit before Workspace results are considered.

### Epic 4.3: Retrieval Budget

Configuration:

```json
{
  "autoRecallTopK": 6,
  "autoRecallBudgetChars": 6000,
  "autoRecallMaxEntryChars": 1500,
  "autoRecallMaxTokens": 1500
}
```

Packing rules:

- Target 300-1200 tokens by default.
- Enforce a 1500-token hard cap.
- Reserve separate Global and Workspace quotas.
- Truncate or summarize long entries.
- Deduplicate by stable Memory ID.
- Exclude quarantined, superseded, and expired entries.
- Run read-time validation before injection.

Output:

```xml
<retrieved-memory
  source="pi-context-memory"
  security="untrusted-context"
  workspace-id="..."
>
...
</retrieved-memory>
```

### Acceptance Criteria

- Current-Workspace results cannot be displaced entirely by Global results.
- Every recall respects character and token budgets.
- Wrong-Workspace memories never become candidates.
- Relevant corrections and failures outrank ordinary old memories.
- The router returns `skip` when memory cannot help.

---

## Phase 5: Automatic Retrieval and Explainability

### Epic 5.1: Context-Hook Automatic Retrieval

Configuration:

```json
{
  "autoRecallEnabled": false,
  "autoRecallMode": "off",
  "autoRecallTopK": 6,
  "autoRecallBudgetChars": 6000
}
```

Modes:

- `off`: use only the existing `memory_search` tool.
- `suggest`: record what would have been retrieved without injecting it.
- `auto`: automatically inject when the router selects retrieval.
- `debug`: inject and expose a detailed trace.

Rollout order:

1. Default to `off`.
2. Collect results in `suggest` mode.
3. Consider an `auto` default only after retrieval evaluation passes.

Keep `memory_search` for model-driven follow-up searches.

### Epic 5.2: Recall Trace

Add:

```ts
interface RecallTrace {
  routerDecision: "retrieve" | "skip";
  routerReasons: string[];
  query: string;
  workspaceId: string | null;
  candidateCount: number;
  candidates: CandidateTrace[];
  selectedIds: string[];
  budgetChars: number;
  budgetTokens: number;
  elapsedMs: number;
}
```

Add commands:

```text
/memory-why
/memory-debug-last
/memory-status
```

Show:

- Why retrieval ran or was skipped.
- The generated query.
- Candidate scores.
- Why candidates were excluded.
- Injected characters and estimated tokens.
- Security, conflict, staleness, and scope filters.

### Epic 5.3: Real Access Statistics

Update the following only when a memory is selected for injection or explicitly read:

- `last_accessed_at`.
- `access_count`.

Do not display synchronization time as "Last used".

### Acceptance Criteria

- `/memory-why` explains the most recent retrieval.
- Retrieval failure never blocks the model call.
- A router skip injects no empty memory block.
- Retrieval latency is measured.
- Automatic retrieval can be disabled with one setting.

---

## Phase 6: Privacy, Migration, Evaluation, and Release

### Epic 6.1: Repo-Local Privacy Boundary

Recommended layout:

```text
.pi/
  workspace.json
  shared/
    MEMORY.md
    knowledge/
    skills/
  private/
    MEMORY.md
  runtime/
    sync-state.json
    quarantine/
    locks/
```

Recommended Git exclusions:

```gitignore
.pi/private/
.pi/runtime/
.pi/*.db
```

Whether `.pi/shared/` is committed remains an explicit user choice.

Migration must:

- Copy and validate before switching paths.
- Produce a migration report.
- Never automatically delete old files.
- Be safely repeatable.
- Support rollback.

### Epic 6.2: Evaluation Suite

Required scenarios:

1. Two same-named Workspaces.
2. Workspace rename.
3. Malicious `.pi/MEMORY.md`.
4. Manual Markdown edits.
5. Concurrent writes.
6. A correction conflicting with an old convention.
7. Global and Workspace results matching simultaneously.
8. Generic questions that should not retrieve memory.
9. A build failure matching a historical failure.
10. Long memories under strict budgets.
11. No duplicate extraction after compaction.
12. Safe degradation when SQLite is unavailable.

Metrics:

- Workspace leakage rate: must be zero.
- Dangerous automatic-injection rate: must be zero.
- Concurrent-write loss rate: must be zero.
- Duplicate observation rate.
- Recall precision@K.
- Router false-positive and false-negative rates.
- Average recalled characters and tokens.
- P50/P95 retrieval latency.
- Markdown/SQLite divergence count.

### Epic 6.3: Release

- [ ] `npm run check`.
- [ ] Full test suite.
- [ ] Native SQLite installation smoke test.
- [ ] macOS/Linux/Windows CI.
- [ ] Node version matrix.
- [ ] Migration dry run.
- [ ] README update.
- [ ] Security documentation update.
- [ ] Configuration reference update.
- [ ] Changelog.
- [ ] Version bump.
- [ ] Release candidate.
- [ ] Stable release.

---

## 4. Suggested Milestones

### v0.8.0-alpha.1: Trust Foundation

- Stable Workspace ID.
- Dynamic Workspace context.
- Unified validation.
- Quarantine.
- Safe repo-local backfill.

### v0.8.0-alpha.2: Consistency

- MemoryStore mutex.
- Stable Memory ID.
- Markdown/SQLite reconciliation.
- `/memory-doctor` and `/memory-repair`.

### v0.8.0-beta.1: Observation

- Observation/Extraction separation.
- Pi custom checkpoints.
- Two-phase compaction.

### v0.8.0-beta.2: Retrieval

- Router.
- BM25/scope/recency ranking.
- Budget packer.
- `suggest` mode.
- `/memory-why`.

### v0.8.0

- Optional automatic retrieval.
- Complete migration path.
- Privacy-aware directory layout.
- Cross-platform verification.
- Documentation and evaluation report.

---

## 5. Recommended First Tasks

Implement in this order:

1. [x] Update the obsolete `AGENTS.md` and roadmap.
2. [x] Add stable Workspace identity and `WorkspaceContextProvider`; refresh Memory, Skills, Search, Review, Correction, Preview, and Consolidation from Pi-provided cwd instead of initialization-time names.
3. [x] Move SQLite isolation to stable Workspace IDs for current writes/search while retaining the legacy `project` display field for one compatibility cycle.
4. [x] Fix active repo-local Markdown backfill with stable Workspace identity.
5. [x] Add unified validation and quarantine to MemoryStore writes, every Markdown import path, and SQLite recall; expose quarantine list/delete commands.
6. [x] Serialize MemoryStore add/failure/replace/remove mutations with a FIFO queue.
7. [x] Add 100-concurrent-write and cross-Workspace isolation tests.
8. [x] Add stable Memory IDs to Markdown and SQLite, including legacy metadata parsing, source provenance, and ID-first synchronization.
9. Implement Markdown/SQLite reconciliation and `/memory-doctor`.
10. Only then begin Router, Ranking, and automatic retrieval.

The first nine tasks establish the safety and consistency foundation required before automatic retrieval can be enabled.
