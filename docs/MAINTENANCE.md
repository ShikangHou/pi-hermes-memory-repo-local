# Maintenance Guide

This repository is the maintained repo-local Workspace distribution of upstream `pi-hermes-memory`.

The runtime package name remains `pi-hermes-memory` for Pi compatibility. The maintained project identity is:

```text
Pi Hermes Memory Repo-Local
```

## Repositories

| Role | Repository |
|---|---|
| Target implementation | `https://github.com/ShikangHou/pi-hermes-memory-repo-local` |
| Upstream | `https://github.com/chandra447/pi-hermes-memory` |

Track the upstream baseline in:

- `docs/upstream.json`
- `docs/UPSTREAM_COMPATIBILITY.md`

## Maintenance Principles

- Keep upstream runtime behavior intact where possible.
- Prefer additive modules, composition, wrappers, adapters, and small integration patches.
- Do not fork full `MemoryStore`, `SkillStore`, Session Search, or Background Review.
- Use `Workspace` in new docs, tests, APIs, and user-visible output.
- Keep `Project` only at upstream and legacy compatibility boundaries.
- Markdown and `SKILL.md` files are source of truth.
- SQLite is a rebuildable local cache and must not be Git-synced.
- Real user data migration must be explicit, no-overwrite, and separately confirmed.

## When Upstream Updates

Do not blind-pull upstream onto `main`.

Use a temporary sync branch:

```bash
git status --short
git branch --show-current
git remote -v
git fetch origin
git fetch upstream
git switch -c sync/upstream-<date>
```

If `upstream` is not configured:

```bash
git remote add upstream https://github.com/chandra447/pi-hermes-memory.git
git fetch upstream
```

Compare the old baseline to the new upstream head:

```bash
git diff <old-upstream-base>..upstream/main --stat
git log --oneline <old-upstream-base>..upstream/main
```

Merge upstream into the sync branch:

```bash
git merge upstream/main
```

Resolve conflicts with these priorities:

1. Preserve upstream implementation unless it violates the long-term context architecture.
2. Preserve repo-local Workspace behavior.
3. Preserve legacy `project` aliases for compatibility.
4. Keep adapter boundaries small.
5. Avoid renaming upstream internals just for terminology cleanup.

## Files To Check After Sync

Always inspect these areas:

| Area | Why |
|---|---|
| `src/index.ts` | Extension wiring, migration hooks, command registration |
| `src/project.ts` and `src/workspace/` | Workspace detection and legacy project compatibility |
| `src/tools/memory-tool.ts` | Memory scope and target compatibility |
| `src/store/skill-store.ts` | Global and Workspace Skill storage/discovery |
| `src/handlers/background-review.ts` | Background mutation boundary: Memory only |
| `src/handlers/context-commands.ts` | Bootstrap and doctor commands |
| `src/context/` | Knowledge, policy, governance, and write-time consistency |
| `skills/long-term-context-router/SKILL.md` | Routing rules and persistence boundaries |
| `docs/upstream.json` | Baseline metadata |
| `docs/UPSTREAM_COMPATIBILITY.md` | Compatibility notes and test expectations |

## Required Checks

Run the normal checks before merging back:

```bash
npm run check
npm test
```

Then verify the behavior that upstream changes are most likely to affect:

- `memory` accepts `scope="workspace"`.
- legacy `scope="project"` and `target="project"` still work as compatibility aliases.
- `memory_search scope="all"` means Global + Current Workspace only.
- Workspace A does not recall Workspace B Memory, Knowledge, or Skills.
- Background Review, Correction Detection, and Session Flush automatically write Memory only.
- Knowledge and Skill changes happen only through foreground workflow.
- `/context-init-global` does not overwrite existing files.
- `/context-init-workspace` does not overwrite existing files.
- `/context-doctor` remains read-only.
- Global Skills and Current Workspace Skills are both discoverable.
- Deleting SQLite search indexes can be recovered from Markdown and `SKILL.md` sources.

## Updating Baseline Metadata

After upstream sync passes:

1. Update `docs/upstream.json`.
2. Update `docs/UPSTREAM_COMPATIBILITY.md`.
3. Record the upstream repository, base version, and base commit.
4. Note any custom integration patches or risk areas.

Example fields:

```json
{
  "upstreamRepository": "https://github.com/chandra447/pi-hermes-memory",
  "targetRepository": "https://github.com/ShikangHou/pi-hermes-memory-repo-local",
  "baseVersion": "<new-version>",
  "baseCommit": "<new-upstream-commit>"
}
```

## Real Data Migration After Upstream Updates

Code updates and real data migration are separate.

After installing a synced version, run read-only diagnostics first:

```text
/context-status
/context-doctor
```

Run them in:

- a non-Workspace directory, to verify Global Base + Live Context only;
- each active Workspace, to verify the Current Workspace Overlay;
- any Workspace with repo-local `.pi/skills/`;
- any Workspace with `.pi/knowledge/INDEX.md`.

Do not migrate real old data automatically. Stop before:

- writing under `~/.pi`;
- writing under a real Workspace `.pi`;
- moving, deleting, archiving, or overwriting old files;
- copying private Memory, Session, SQLite, auth, or machine-local data into Git;
- Git adding, committing, or pushing real Workspace `.pi` data.

Use `docs/REAL_DATA_MIGRATION_PLAN.md` as the current migration record. If a new upstream version changes storage behavior, add a new dated section to that file before touching real data.

## Safe Migration Model

When migration is explicitly approved:

1. Create a private snapshot manifest outside Git.
2. Use no-overwrite bootstrap commands.
3. Prefer Knowledge INDEX references to existing Markdown over copying full documents.
4. Preserve old directories until validation passes.
5. Mark old Knowledge entries `stale` or `archived` before considering any file movement.
6. Avoid deletion in the first migration pass.

Recommended order:

```text
read-only inventory
→ private manifest
→ /context-init-global
→ /context-init-workspace
→ reference existing Markdown in Knowledge INDEX
→ /context-status
→ /context-doctor
→ explicit review
→ optional archive plan
```

## Publishing

After merge to `main`:

```bash
npm run check
npm test
git status --short
git push origin main
```

Users can then update the installed extension:

```bash
pi update --extensions
```

If `npm audit` reports vulnerabilities during installation, do not run `npm audit fix` blindly. First identify the package and decide whether the fix changes runtime behavior or upstream compatibility.

## Do Not Do

- Do not force-push shared history.
- Do not reset or stash user changes automatically.
- Do not rewrite upstream core modules unless unavoidable.
- Do not introduce a fifth long-term data category beyond Memory, Knowledge, Skill, and Session.
- Do not add a Knowledge database or vector index in the first architecture version.
- Do not create duplicate source-of-truth Markdown when an existing document can be referenced.
- Do not auto Git-add Workspace `.pi` data.
