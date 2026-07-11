# v0.8 Baseline and Compatibility

Recorded: 2026-07-11 (Asia/Shanghai)

## Baseline

| Check | Result |
|---|---|
| Package | `pi-hermes-memory@0.7.23` |
| Runtime used | Node `22.23.1`, npm `10.9.8`, macOS arm64 |
| `npm run check` | Pass |
| Full `npm test` | Pass — all 41 test files |
| Native SQLite smoke test | Pass after rebuilding `better-sqlite3` for Node 22/darwin/arm64 |
| SQLite degraded-mode evidence | The initial missing-binding failure was explicit (`Could not locate the bindings file`); no silent fallback or data loss was observed |

The initial sandbox run failed because `tsx` could not create its IPC socket. Running outside that sandbox then exposed a missing native binding. `npm rebuild better-sqlite3` repaired the active Node ABI installation, after which all 41 test files passed.

Reproduce the native smoke test after installing dependencies for the active Node ABI:

```bash
npm install
npm test
```

## Supported Versions

| Component | Supported | Verification level |
|---|---|---|
| Node.js | 20.x, 22.x | Declared package range; 22.x is primary CI and local baseline |
| Pi coding agent | >= 0.74.0 | Declared peer dependency; development uses 0.80.x |
| npm | npm bundled with supported Node releases | Primary install workflow |
| Bun | Not a release-gated runtime | SQLite compatibility adapter exists, but the full suite is not yet a required matrix job |

## Platform Matrix

| Platform | Intended support | Current evidence | Release requirement |
|---|---|---|---|
| Linux x64 | Supported | GitHub CI uses Ubuntu + Node 22 | Add Node 20/22 matrix and native SQLite smoke test |
| macOS arm64/x64 | Supported | arm64 typecheck and full Node 22 suite pass, including native SQLite | Add Node 20/22 matrix or documented manual smoke test |
| Windows x64 | Supported | Path-normalization tests cover Windows-style moved paths | Add Windows Node 20/22 CI and native SQLite smoke test |

Cross-platform support is conditional on a compatible `better-sqlite3` binary or successful native build. Missing native SQLite support must remain a clear diagnostic and must not cause silent data loss.

## Phase 0 Exit Notes

- Repository instructions now describe v0.7/v0.8, SQLite, and actual storage paths.
- Node and Pi version ranges are declared.
- The compatibility matrix and current native dependency blocker are explicit.
- Phase 1 may begin, but automatic recall remains disabled.
