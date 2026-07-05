---
name: long-term-context-router
description: Route retrieval and persistence across Memory, Knowledge, Skill, and Session using Global Base + Current Workspace Overlay + Live Context.
version: 1
---

# Long-Term Context Router

Use this skill when a task may depend on durable context, when deciding whether to save information, or when choosing between Memory, Knowledge, Skill, and Session.

## Core Priority

Current evidence always wins.

Priority order:

1. User latest explicit instruction.
2. Current Workspace files and code.
3. Current tool output and test results.
4. Current conversation.
5. Current Workspace Overlay.
6. Global Base.
7. Long-form Knowledge.
8. Session archive.

## Retrieval Routing

Start with Live Context: user request, current files, current tools, current tests, current conversation.

Use `memory_search` for short durable facts:

- User preferences.
- Current effective conventions.
- Workspace decisions.
- Failures, corrections, insights, and tool quirks.

Default `memory_search scope="all"` means Global plus Current Workspace only. It must not search every historical Workspace.

Read Knowledge when the task needs full background:

- Architecture explanations.
- Design history.
- Research routes.
- Long investigation summaries.
- Complex decision evolution.

Find or use Skills when the task is repeatable:

- Build, deploy, train, test, collect, debug, release, or operate workflows.
- Prefer patch/update of an existing Skill over creating a duplicate.

Use `session_search` only when Memory and Knowledge are insufficient, or when exact historical wording is needed.

## Persistence Routing

Save to Memory only when the fact is short, stable, explicit, and likely useful later.

Use:

- `scope="global"` for Global Base.
- `scope="workspace"` for the Current Workspace Overlay.
- `target="user"` only with `scope="global"`.
- `target="failure"` for failures, corrections, insights, conventions, preferences, and tool quirks.

Do not save temporary task state, current branch state, one-off TODOs, guesses, secrets, credentials, or machine-local facts into Git-synced Workspace Memory.

Route long background to Knowledge through foreground work. Reuse existing Markdown sources of truth instead of copying them into a duplicate `.pi/knowledge` file. Update the Knowledge INDEX when a source is added, superseded, stale, or archived.

Route reusable procedures to Skills through foreground work. Search existing Skills first; patch or update before creating a new Skill.

Candidate signals are ephemeral. Do not create candidate databases, queues, markdown files, or folders.

## Workspace Boundary

Use Workspace as the canonical term. Project is a legacy compatibility term only.

The visible long-term context is:

- Global Base.
- Current Workspace Overlay.

Other Workspace overlays must not be visible. Cross-Workspace recall is an isolation bug.

## Source Of Truth

Markdown and `SKILL.md` files are source of truth.

SQLite is a local rebuildable search cache and must not be treated as canonical.

## Background Boundaries

Background Review, Correction Detection, and Session Flush may automatically write Memory only.

They must not automatically write Knowledge or Skills.

Knowledge and Skills are changed only through normal foreground agent workflow.
