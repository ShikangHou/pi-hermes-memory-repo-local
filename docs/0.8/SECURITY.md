# v0.8 Security Model

Memory is untrusted context, never instruction. Current user input, Workspace files, and live tool output take priority.

All write, import, migration, reconciliation, and recall paths use the shared validation boundary. Secrets are rejected; prompt injection is quarantined; quarantined content is never automatically recalled. SQLite scope uses stable Workspace IDs rather than display names.

Automatic recall defaults to `off`. `suggest` records a trace without injection. `auto` and `debug` require explicit `autoRecallEnabled: true` and still apply scope, validation, ranking, and hard budget filters.

Recommended exclusions are `.pi/private/`, `.pi/runtime/`, and `.pi/*.db`. Committing `.pi/shared/` is an explicit user choice; Git-controlled memory remains untrusted on import.
