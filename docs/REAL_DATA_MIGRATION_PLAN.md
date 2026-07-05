# Real Data Migration Plan

Status: read-only migration plan. No real old data was moved, deleted, copied, overwritten, indexed, committed, or pushed by this plan.

Design source: `/Users/houshikang/Documents/Codex/memory/LONG_TERM_CONTEXT_ARCHITECTURE.md`

Generated from read-only inventory on 2026-07-05.

## Confirmed Decisions

Confirmed on 2026-07-05:

- Treat `/Volumes/hsk/daa_doc/doc1` as an active Workspace.
- Treat `/Volumes/hsk/daa_doc/doc2` as an active Workspace.
- Treat `/Volumes/hsk/daa_doc/doc3` as an active Workspace.
- Ignore `/Volumes/hsk/$RECYCLE.BIN/$RWSK756/.pi`.
- Allow creating missing `.pi/workspace.json`, `.pi/WORKSPACE.md`, and `.pi/knowledge/INDEX.md` in confirmed Workspaces.
- Allow creating `/Users/houshikang/.pi/knowledge/INDEX.md` if missing.
- Use reference-based Knowledge migration: update INDEX files to point to existing Markdown rather than copying full documents.
- Do not auto Git add, commit, or push real Workspace `.pi` data.

## Execution Log

2026-07-05:

- Created private snapshot manifest at `/private/tmp/pi-real-data-migration-manifest.txt`.
- Manifest contains 659 metadata rows for Markdown, `SKILL.md`, `workspace.json`, and `config.json` files.
- Created `/Users/houshikang/.pi/knowledge/INDEX.md`.
- Created `/Volumes/hsk/daa_doc/doc1/.pi/workspace.json`.
- Created `/Volumes/hsk/daa_doc/doc1/.pi/WORKSPACE.md`.
- Created `/Volumes/hsk/daa_doc/doc1/.pi/knowledge/INDEX.md`.
- Created `/Volumes/hsk/daa_doc/doc2/.pi/workspace.json`.
- Created `/Volumes/hsk/daa_doc/doc2/.pi/WORKSPACE.md`.
- Created `/Volumes/hsk/daa_doc/doc2/.pi/knowledge/INDEX.md`.
- Created `/Volumes/hsk/daa_doc/doc3/.pi/workspace.json`.
- Created `/Volumes/hsk/daa_doc/doc3/.pi/WORKSPACE.md`.
- Created `/Volumes/hsk/daa_doc/doc3/.pi/knowledge/INDEX.md`.
- Updated `/Users/houshikang/.pi/knowledge/INDEX.md` with reference rows pointing to existing legacy `/Users/houshikang/.pi/memory/*.md` files.
- Updated `/Volumes/hsk/daa_doc/doc2/.pi/knowledge/INDEX.md` with reference rows pointing to existing doc2 `.pi/memory/*.md` files.
- Did not copy long-form Markdown content.
- Did not move, delete, overwrite, archive, Git add, commit, or push real `.pi` data.

## Scope

This plan covers existing real local Pi data:

- Global Base data under `/Users/houshikang/.pi`.
- Legacy central Workspace compatibility data under `/Users/houshikang/.pi/agent/projects-memory`.
- Project-level `.pi` directories discovered on local volumes.

The plan follows the canonical architecture:

```text
Global Base
+
Current Workspace Overlay
+
Live Context
```

New work must use `Workspace` terminology. `Project` appears only when naming legacy paths or upstream compatibility behavior.

## Non-Actions

The following actions are explicitly not performed and must remain blocked until confirmed:

- Do not move, delete, overwrite, or archive old `/Users/houshikang/.pi` data.
- Do not copy private `USER.md`, `MEMORY.md`, SQLite databases, session logs, or machine-local files into Git.
- Do not auto Git add, commit, or push Workspace data from real user projects.
- Do not migrate data from legacy paths into new paths without a separate confirmation.
- Do not treat `/Volumes/hsk/$RECYCLE.BIN/.../.pi` as a valid Workspace unless explicitly confirmed.

## Read-Only Inventory

### Global Base Candidates

| Path | Current Role | Target Role | Planned Handling | Risk |
|---|---|---|---|---|
| `/Users/houshikang/.pi/agent/pi-hermes-memory/USER.md` | runtime Markdown | Global User Memory | Keep machine-local in place | Personal data; never copy into Git |
| `/Users/houshikang/.pi/agent/pi-hermes-memory/MEMORY.md` | runtime Markdown | Global Memory | Keep machine-local in place | Private facts; never copy into Git |
| `/Users/houshikang/.pi/agent/pi-hermes-memory/sessions.db` | SQLite index/cache | Session index | Keep machine-local; rebuildable cache | Do not Git sync |
| `/Users/houshikang/.pi/agent/pi-hermes-memory/skills/` | skill directory | Global Skills | Keep in place | Empty or runtime-managed |
| `/Users/houshikang/.pi/agent/skills/` | skill directory | Global Skills candidate | Review before inclusion | May contain unrelated runtime data |
| `/Users/houshikang/.pi/skills/` | skill directory | Global Skills candidate | Review before inclusion | May duplicate other skill roots |
| `/Users/houshikang/.pi/remote/skills/agent-network/SKILL.md` | remote skill | Global Skill candidate | Keep as remote-managed unless user wants local consolidation | Remote source may have its own lifecycle |

### Legacy Knowledge Candidates

| Path | Current Role | Target Role | Planned Handling | Risk |
|---|---|---|---|---|
| `/Users/houshikang/.pi/memory/INDEX.md` | legacy Markdown index | Global Knowledge index candidate | Use as source material when creating `/Users/houshikang/.pi/knowledge/INDEX.md`; do not overwrite existing files | Could contain private or stale links |
| `/Users/houshikang/.pi/memory/MEMORY_POLICY.md` | legacy policy Markdown | Global Knowledge candidate | Reference from Global Knowledge INDEX if still active | Could be superseded by package Core Policy |
| `/Users/houshikang/.pi/memory/TEMPLATE.md` | legacy template Markdown | Knowledge or Skill candidate | Classify after review: Skill if repeatable workflow, Knowledge if background | Ambiguous role |
| `/Users/houshikang/.pi/memory/daily-push.md` | legacy Markdown | Knowledge, Skill, or stale Live Context candidate | Review freshness before any migration | Time-sensitive content may be stale |

### Legacy Central Workspace Compatibility

| Path | Current Role | Target Role | Planned Handling | Risk |
|---|---|---|---|---|
| `/Users/houshikang/.pi/agent/projects-memory/doc2/skills/` | legacy central project skills path | Workspace Skills compatibility source | Compare with `/Volumes/hsk/daa_doc/doc2/.pi/skills/`; keep legacy path until verified unused | Legacy path must not override Workspace-local `.pi` |

### Session Archive

`/Users/houshikang/.pi/agent/sessions/` contains historical session archives, including entries associated with multiple working directories. These are Session fallback data, not current facts.

Planned handling:

- Keep append-only and machine-local.
- Do not migrate into Workspace Memory or Knowledge.
- Use only as fallback archive when Memory and Knowledge do not answer a question.

## Project-Level `.pi` Directories Found

Read-only scans found these active project-level `.pi` directories:

| Workspace Root | `.pi` Size | File Count | Observed Data | Planned Role |
|---|---:|---:|---|---|
| `/Volumes/hsk/daa_doc/doc1` | 62M | 369 | `.pi/remote-pi/config.json`, `.pi/skills/minimax-docx/` | Workspace Overlay candidate with Workspace Skills |
| `/Volumes/hsk/daa_doc/doc2` | 89M | 404 | `.pi/memory/INDEX.md`, `.pi/memory/sdd-v4-plan.md`, `.pi/memory/user-manual-v2.md`, `.pi/remote-pi/config.json`, `.pi/skills/minimax-docx/`, `.pi/skills/sdd-review/`, `.pi/skills/technical-document-review/` | Workspace Overlay candidate with Workspace Knowledge and Workspace Skills |
| `/Volumes/hsk/daa_doc/doc3` | 64M | 302 | `.pi/skills/minimax-docx/`, `.pi/skills/technical-document-review/` | Workspace Overlay candidate with Workspace Skills |

Also found:

| Path | Handling |
|---|---|
| `/Volumes/hsk/$RECYCLE.BIN/$RWSK756/.pi` | Treat as trash/recycle residue. Do not migrate unless explicitly confirmed. |

Scan limitations:

- `/Users/houshikang/Pictures/Photos Library.photoslibrary` was not readable due to OS permissions.
- `/Volumes/hsk/.Trashes` and `/Volumes/hsk/.Spotlight-V100` were not readable due to OS permissions.
- No project-level `.pi` was found under common user directories scanned except global `/Users/houshikang/.pi`.

## Classification Rules

### Memory

Short, stable, explicit facts should become Memory only when they are current and scoped correctly.

Planned handling:

- Global user facts stay in Global User Memory.
- Global durable facts stay in Global Memory.
- Workspace-specific durable facts should live under that Workspace Overlay only.
- Machine-local facts must not be written to Git-synced Workspace Memory.

### Knowledge

Long-form background should be routed through Knowledge INDEX files without duplicating source documents.

Planned handling:

- Global Knowledge INDEX target: `/Users/houshikang/.pi/knowledge/INDEX.md`.
- Workspace Knowledge INDEX target: `<workspace-root>/.pi/knowledge/INDEX.md`.
- Existing long Markdown remains source of truth and should be referenced, not copied, unless the user explicitly requests consolidation.
- `doc2` legacy `.pi/memory/*.md` should be treated as Workspace Knowledge candidates, not automatically converted into Memory.

### Skill

Repeatable workflows should remain Skills.

Planned handling:

- Existing `.pi/skills/<skill>/SKILL.md` directories remain Workspace Skills.
- Do not background-create, delete, or merge Skills.
- Duplicate or similar Skills should be reported by doctor-style checks before any manual consolidation.

### Session

Session data remains fallback archive.

Planned handling:

- Keep session logs and SQLite indexes machine-local.
- Do not migrate session logs into Knowledge or Memory.
- Rebuild SQLite indexes from source-of-truth Markdown and `SKILL.md` where applicable.

## Proposed Migration Phases

### Phase 1: Confirmation Gate

Status: completed by explicit user confirmation on 2026-07-05.

Stop and ask the user to confirm:

- Whether `/Volumes/hsk/daa_doc/doc1`, `/Volumes/hsk/daa_doc/doc2`, and `/Volumes/hsk/daa_doc/doc3` should all be treated as active Workspaces.
- Whether `/Volumes/hsk/$RECYCLE.BIN/$RWSK756/.pi` should be ignored.
- Whether migration should create missing marker/index files in real data locations.
- Whether migration should only reference existing Markdown or also copy selected files.

No file changes outside this repository should happen before this confirmation.

### Phase 2: Snapshot Manifest

Status: completed on 2026-07-05. Manifest path: `/private/tmp/pi-real-data-migration-manifest.txt`.

Create a read-only manifest before writing any real data:

- List candidate paths.
- Record file sizes and modification times.
- Optionally record hashes for Markdown and `SKILL.md` files.
- Exclude secrets, auth files, SQLite databases, and session logs from content hashing unless explicitly needed.

The manifest should be written outside Git or into a private local-only path unless the user approves committing non-sensitive metadata.

### Phase 3: Global Initialization

Status: completed on 2026-07-05. Created `/Users/houshikang/.pi/knowledge/INDEX.md` and added reference rows only.

Run package bootstrap only after confirmation:

```text
/context-init-global
```

Expected behavior:

- Create `/Users/houshikang/.pi/knowledge/INDEX.md` only if missing.
- Never overwrite an existing Global Knowledge INDEX.
- Keep `/Users/houshikang/.pi/memory/*` intact.

Then update Global Knowledge INDEX explicitly, using references to existing legacy Markdown:

- `/Users/houshikang/.pi/memory/INDEX.md`
- `/Users/houshikang/.pi/memory/MEMORY_POLICY.md`
- `/Users/houshikang/.pi/memory/TEMPLATE.md`
- `/Users/houshikang/.pi/memory/daily-push.md`

Each entry must include status: `active`, `stale`, or `archived`.

### Phase 4: Workspace Initialization

Status: completed on 2026-07-05 for `/Volumes/hsk/daa_doc/doc1`, `/Volumes/hsk/daa_doc/doc2`, and `/Volumes/hsk/daa_doc/doc3`.

For each confirmed Workspace:

```text
cd <workspace-root>
/context-init-workspace
/context-status
/context-doctor
```

Expected behavior:

- Create `<workspace-root>/.pi/workspace.json` only if missing.
- Create `<workspace-root>/.pi/WORKSPACE.md` only if missing.
- Create `<workspace-root>/.pi/knowledge/INDEX.md` only if missing.
- Do not overwrite existing `.pi/memory`, `.pi/skills`, `.pi/remote-pi`, or skill files.

Workspace-specific planned notes:

| Workspace | Planned Handling |
|---|---|
| `/Volumes/hsk/daa_doc/doc1` | Preserve `.pi/skills/minimax-docx/`; create marker/index only after confirmation; no existing Workspace Knowledge files observed in shallow inventory |
| `/Volumes/hsk/daa_doc/doc2` | Preserve `.pi/memory/*.md` as Workspace Knowledge candidates; preserve `minimax-docx`, `sdd-review`, and `technical-document-review` Skills; reconcile legacy central `projects-memory/doc2` only after doctor report |
| `/Volumes/hsk/daa_doc/doc3` | Preserve `minimax-docx` and `technical-document-review` Skills; create marker/index only after confirmation |

### Phase 5: Workspace Knowledge Routing

Status: partially completed on 2026-07-05. `doc2` has existing `.pi/memory/*.md` files and now has Workspace Knowledge INDEX reference rows. `doc1` and `doc3` had no Workspace Knowledge Markdown candidates in the shallow inventory, so their Workspace Knowledge INDEX files remain templates.

For each confirmed Workspace, update `<workspace-root>/.pi/knowledge/INDEX.md` manually through foreground workflow.

Do:

- Reference existing source Markdown.
- Mark stale or archived entries instead of deleting.
- Include `Purpose`, `When to Read`, `Status`, `Last Reviewed`, `Supersedes`, and `Superseded By`.

Do not:

- Copy a long document into `.pi/knowledge/` merely because it is Knowledge.
- Create duplicate source-of-truth files.
- Convert current TODO or task-progress notes into Knowledge.

### Phase 6: Skills Review

Run doctor-style checks for each confirmed Workspace:

- Similar or duplicate Skills.
- Missing `SKILL.md`.
- Verification gaps.
- Deprecated or stale Skills.

Expected current Skill candidates:

| Workspace | Skills |
|---|---|
| `/Volumes/hsk/daa_doc/doc1` | `minimax-docx` |
| `/Volumes/hsk/daa_doc/doc2` | `minimax-docx`, `sdd-review`, `technical-document-review` |
| `/Volumes/hsk/daa_doc/doc3` | `minimax-docx`, `technical-document-review` |

No Skill should be merged, deleted, renamed, or copied without confirmation.

### Phase 7: Legacy Compatibility Reconciliation

Compare only after Workspace-local files are recognized:

- `/Users/houshikang/.pi/agent/projects-memory/doc2/skills/`
- `/Volumes/hsk/daa_doc/doc2/.pi/skills/`

Expected policy:

- Prefer Workspace-local `.pi` as the Workspace Overlay source of truth.
- Keep legacy central path for compatibility until verified unused.
- Do not delete or move the legacy path in the first migration pass.

### Phase 8: Validation

For each confirmed Workspace:

```text
/context-status
/context-doctor
memory_search scope=all
```

Validation expectations:

- `scope=all` means Global + Current Workspace only.
- `doc1` must not see `doc2` or `doc3` Workspace data.
- `doc2` must not see `doc1` or `doc3` Workspace data.
- `doc3` must not see `doc1` or `doc2` Workspace data.
- Existing Workspace Skills remain discoverable.
- SQLite data is treated as rebuildable cache, not source of truth.

### Phase 9: Optional Archive Plan

Only after successful validation and explicit confirmation:

- Mark legacy files as `stale` or `archived` in Knowledge INDEX.
- Optionally move obsolete legacy files into an archive directory.

This phase is high risk and must stop before execution. Deletion is not recommended for the first real migration.

## Required User Confirmations Before Real Migration

Before any further high-risk migration, confirm all of the following:

1. Treat `/Volumes/hsk/daa_doc/doc1` as an active Workspace: confirmed yes.
2. Treat `/Volumes/hsk/daa_doc/doc2` as an active Workspace: confirmed yes.
3. Treat `/Volumes/hsk/daa_doc/doc3` as an active Workspace: confirmed yes.
4. Ignore `/Volumes/hsk/$RECYCLE.BIN/$RWSK756/.pi`: confirmed yes.
5. Allow creating missing `.pi/workspace.json`, `.pi/WORKSPACE.md`, and `.pi/knowledge/INDEX.md` in confirmed Workspaces: confirmed yes.
6. Allow creating `/Users/houshikang/.pi/knowledge/INDEX.md` if missing: confirmed yes.
7. Migration style: confirmed reference existing Markdown only.
8. Whether any generated manifest may be committed to Git.
9. Whether old `/Users/houshikang/.pi/memory` files may ever be archived after validation.

## High-Risk Stop Points

Stop and report before:

- Writing anywhere under `/Users/houshikang/.pi`.
- Writing anywhere under `/Volumes/hsk/daa_doc/*/.pi`.
- Moving, deleting, archiving, or overwriting existing old files.
- Reading or copying auth files, secrets, session logs, or private full text into Git.
- Auto Git add, commit, or push real Workspace `.pi` data.
- Resolving a conflict where current data and old Memory/Knowledge disagree.
- Treating a trash/recycle `.pi` as active Workspace data.

## Immediate Next Step

Ask for confirmation on the checklist above. After confirmation, execute Phase 2 only: create a private snapshot manifest and run bootstrap/doctor commands in no-overwrite mode.
