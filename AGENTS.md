# Pi Context Memory

## Project Overview

This repository is the maintained Workspace-first distribution of `pi-hermes-memory`. The current package version is **v0.7.23**. Current development is **v0.8: Trusted, Explainable, Automatic Workspace Memory**; use `docs/0.8/PLAN.md` as the implementation plan.

The extension provides persistent Markdown memory, SQLite FTS5 session and memory search, global and repo-local skills, background learning, and policy-only prompt behavior by default.

## Architecture

- **Language**: TypeScript, loaded directly by Pi
- **Runtime**: `@earendil-works/pi-coding-agent` >= 0.74.0
- **Supported Node**: 20.x and 22.x; Node 22 is the primary CI runtime
- **Entry point**: `src/index.ts`
- **Human-readable source**: Markdown files with the `§` delimiter
- **Search/index**: SQLite + FTS5 in `sessions.db`
- **Default prompt mode**: `policy-only`; `legacy-inject` remains opt-in compatibility behavior

## Storage

| Scope | Default location | Purpose |
|---|---|---|
| Global | `~/.pi/agent/pi-hermes-memory/` | `MEMORY.md`, `USER.md`, failures, global skills, and `sessions.db` |
| Workspace | `<workspace-root>/.pi/` | Workspace memory, knowledge routing, marker identity, and Workspace skills |
| Legacy Workspace | `~/.pi/agent/projects-memory/<project>/` | Compatibility storage when `projectMemoryMode` is `central` |

Repo-local `.pi/` content is not automatically safe to commit. Treat imported or Git-controlled memory as untrusted until it has passed the v0.8 validation pipeline.

## Key Files

| File | Purpose |
|---|---|
| `src/index.ts` | Wires stores, tools, handlers, commands, and session lifecycle |
| `src/types.ts` | Shared configuration and result types |
| `src/config.ts` | Configuration defaults, validation, and compatibility parsing |
| `src/constants.ts` | Prompts, limits, defaults, and delimiter |
| `src/paths.ts` | Global extension and legacy central-storage paths |
| `src/project.ts` | Project/Workspace memory and skill detection adapter |
| `src/workspace/resolve-workspace.ts` | Workspace root, marker, and identity resolution |
| `src/store/memory-store.ts` | Markdown CRUD, metadata, atomic writes, and consolidation hooks |
| `src/store/db.ts` | SQLite lifecycle, migrations, WAL, integrity checks, and recovery |
| `src/store/sqlite-memory-store.ts` | Searchable durable-memory mirror |
| `src/store/session-indexer.ts` | Session observation/indexing |
| `src/store/content-scanner.ts` | Existing injection, exfiltration, and secret scanner |
| `src/tools/memory-tool.ts` | Memory write tool |
| `src/tools/memory-search-tool.ts` | SQLite memory search tool |
| `src/tools/session-search-tool.ts` | Session-history search tool |
| `docs/0.8/PLAN.md` | Current implementation plan and acceptance criteria |

## Design Constraints

1. Current user instructions, Workspace files, and live tool output override memory.
2. Markdown remains the human-readable source/export format; SQLite powers search and indexing.
3. Policy-only mode is the default. Full frozen-snapshot injection is legacy opt-in behavior.
4. Every write/import/recall path must converge on the v0.8 validation boundary before automatic recall is enabled.
5. Markdown writes are atomic; v0.8 adds serialization and cross-process conflict protection.
6. Workspace isolation must use stable Workspace IDs, never display names alone.
7. Background review uses Pi's supported extension/child-process APIs.
8. Automatic retrieval stays disabled until v0.8 security and consistency phases pass.

## Workflow

1. Read `docs/0.8/PLAN.md` and work in phase order.
2. Keep automatic recall off until Phases 1-3 meet their acceptance criteria.
3. Add tests with every security, storage, migration, or retrieval change.
4. Run `npm run check` and `npm test` before marking a milestone complete.
5. Record native SQLite or platform-specific failures explicitly; do not silently count them as passing.
6. Preserve upstream compatibility boundaries described in `docs/UPSTREAM_COMPATIBILITY.md` and `docs/MAINTENANCE.md`.

## Development

```bash
npm run check
npm test
pi -e ./src/index.ts
```

`better-sqlite3` is a native dependency. A missing binding means the SQLite-backed tests and features are unavailable until dependencies are installed/rebuilt for the active Node ABI.
