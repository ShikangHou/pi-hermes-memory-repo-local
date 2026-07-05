# Upstream Compatibility

Design source: `LONG_TERM_CONTEXT_ARCHITECTURE.md`

## Baseline

- Upstream repository: `https://github.com/chandra447/pi-hermes-memory`
- Target repository: `https://github.com/ShikangHou/pi-context-memory`
- Base version: `0.7.23`
- Base commit: `fe7e7e3`

## Terminology Boundary

`Workspace` is the canonical term for new architecture, docs, APIs, tests, and user-visible output.

`Project` remains only as a legacy compatibility term for upstream internals, old database fields, old API aliases, and existing repo-local project memory behavior.

## Customization Strategy

Custom behavior should prefer:

1. Additive modules.
2. Composition.
3. Wrappers and adapters.
4. Small integration patches.
5. Direct upstream-core modification only when unavoidable.

## Current Custom Capabilities To Preserve

- Repo-local project memory stored under the Git root `.pi/` directory when configured.
- Project-scoped skills under the active project or repo-local memory directory.
- Legacy `target="project"` memory tool behavior.
- Legacy `scope="project"` skill behavior.
- Markdown remains the source of truth; SQLite remains a rebuildable search cache.

## Expected Compatibility Tests

- Legacy `target="project"` continues to write workspace-compatible memory.
- Legacy `scope="project"` remains accepted where existing tools expose it.
- New `scope="workspace"` APIs map to the existing project-backed storage boundary.
- `memory_search scope="all"` returns Global plus the current Workspace only.
- Workspace A does not recall Workspace B Memory, Knowledge, or Skills.
- Background Review, Correction Detection, and Session Flush may automatically write Memory only.
- Skill creation still prefers patch/update of existing skills over duplicate creation.
- SQLite can be rebuilt from Markdown and `SKILL.md` sources.

## Upstream Sync Process

Detailed maintenance and migration procedure: `docs/MAINTENANCE.md`.

1. Fetch new upstream.
2. Create a temporary sync branch.
3. Compare old upstream base to new upstream.
4. Merge upstream changes into the sync branch.
5. Resolve adapter-layer conflicts.
6. Run upstream tests.
7. Run custom compatibility tests.
8. Verify behavior against `LONG_TERM_CONTEXT_ARCHITECTURE.md`.
9. Merge back to `main`.

Do not blind-pull upstream directly onto `main`.
