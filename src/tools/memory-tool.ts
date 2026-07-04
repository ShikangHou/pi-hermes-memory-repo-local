/**
 * Memory tool — registers the LLM-callable `memory` tool.
 * Ported from hermes-agent/tools/memory_tool.py (MEMORY_SCHEMA + memory_tool dispatch).
 * See PLAN.md → "Hermes Source File Reference Map" for source lines.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { StringEnum } from "@earendil-works/pi-ai";
import { MemoryStore } from "../store/memory-store.js";
import { DatabaseManager } from "../store/db.js";
import {
  formatFailureMemoryContent,
  removeExactSyncedMemories,
  removeSyncedMemories,
  replaceSyncedMemories,
  syncMemoryEntry,
} from "../store/sqlite-memory-store.js";
import { MEMORY_TOOL_DESCRIPTION } from "../constants.js";
import type { MemoryCategory, MemoryResult } from "../types.js";

function appendSyncWarning(result: MemoryResult, warning: string): MemoryResult {
  const warnings = [...(((result as any).warnings ?? []) as string[]), warning];
  const message = result.message ? `${result.message} Warning: ${warning}` : warning;
  return {
    ...result,
    message,
    warning,
    warnings,
  } as MemoryResult;
}

function formatMemoryToolText(result: MemoryResult): string {
  const evictedEntries = result.evicted_entries ?? [];
  if (result.success && evictedEntries.length > 0) {
    const lines = [
      result.message ?? `Memory updated. Rotated ${evictedEntries.length} older ${evictedEntries.length === 1 ? "entry" : "entries"} to stay within the limit.`,
      "",
      "Rotated active memory entries:",
      "",
    ];

    evictedEntries.forEach((entry, index) => {
      lines.push(`${index + 1}. ${entry}`);
      lines.push("");
    });

    lines.push("If one of these entries should stay active, add it again.");
    if (result.usage) lines.push(`Usage: ${result.usage}`);
    return lines.join("\n").trim();
  }

  return JSON.stringify(result);
}

type MemoryToolTarget = "memory" | "user" | "project" | "failure";
type MemoryToolScope = "global" | "workspace" | "project";

interface ResolvedMemoryRoute {
  scope: "global" | "workspace";
  target: "memory" | "user" | "failure";
  sqliteProject: string | null;
  legacyProjectTarget: boolean;
}

function normalizeMemoryRoute(
  rawTarget: MemoryToolTarget,
  rawScope: MemoryToolScope | undefined,
  projectName?: string | null,
): ResolvedMemoryRoute {
  const scope = rawTarget === "project"
    ? "workspace"
    : rawScope === "project"
      ? "workspace"
      : rawScope ?? "global";
  const target = rawTarget === "project" ? "memory" : rawTarget;
  const sqliteProject = scope === "workspace" ? projectName?.trim() || null : null;

  return {
    scope,
    target,
    sqliteProject,
    legacyProjectTarget: rawTarget === "project",
  };
}

async function syncAddToSqlite(
  route: ResolvedMemoryRoute,
  content: string,
  category: MemoryCategory | undefined,
  failureReason: string | undefined,
  dbManager: DatabaseManager | null,
): Promise<string | null> {
  if (!dbManager) return null;

  try {
    if (route.target === "failure") {
      const failureCategory = category ?? "failure";
      syncMemoryEntry(dbManager, {
        content: formatFailureMemoryContent(content, {
          category: failureCategory,
          failureReason,
        }),
        target: "failure",
        project: route.sqliteProject,
        category: failureCategory,
        failureReason,
      });
      return null;
    }

    syncMemoryEntry(dbManager, {
      content,
      target: route.target,
      project: route.sqliteProject,
    });
    return null;
  } catch (err) {
    return `Saved to Markdown, but SQLite search sync failed: ${err instanceof Error ? err.message : String(err)}`;
  }
}

async function syncReplaceToSqlite(
  route: ResolvedMemoryRoute,
  oldText: string,
  newContent: string,
  dbManager: DatabaseManager | null,
): Promise<string | null> {
  if (!dbManager) return null;

  try {
    const syncResult = replaceSyncedMemories(dbManager, oldText, {
      content: newContent,
      target: route.target,
      project: route.sqliteProject,
    });

    if (syncResult.matched === 0) {
      return "Saved to Markdown, but no matching SQLite memory row was updated. Run /memory-sync-markdown if search results look stale.";
    }

    return null;
  } catch (err) {
    return `Saved to Markdown, but SQLite search sync failed: ${err instanceof Error ? err.message : String(err)}`;
  }
}

async function syncRemoveFromSqlite(
  route: ResolvedMemoryRoute,
  oldText: string,
  dbManager: DatabaseManager | null,
): Promise<string | null> {
  if (!dbManager) return null;

  try {
    const syncResult = removeSyncedMemories(dbManager, oldText, {
      target: route.target,
      project: route.sqliteProject,
    });

    if (syncResult.matched === 0) {
      return "Saved to Markdown, but no matching SQLite memory row was removed. Run /memory-sync-markdown if search results look stale.";
    }

    return null;
  } catch (err) {
    return `Saved to Markdown, but SQLite search sync failed: ${err instanceof Error ? err.message : String(err)}`;
  }
}

async function syncEvictionsFromSqlite(
  route: ResolvedMemoryRoute,
  evictedEntries: string[] | undefined,
  dbManager: DatabaseManager | null,
): Promise<void> {
  if (!dbManager) return;
  if (!evictedEntries || evictedEntries.length === 0) return;

  for (const entry of evictedEntries) {
    try {
      removeExactSyncedMemories(dbManager, entry, {
        target: route.target,
        project: route.sqliteProject,
      });
    } catch {
      // FIFO already updated the Markdown source of truth. SQLite is only a
      // best-effort search mirror, so eviction cleanup must not fail the write.
    }
  }
}

export function registerMemoryTool(
  pi: ExtensionAPI,
  store: MemoryStore,
  projectStore: MemoryStore | null,
  dbManager: DatabaseManager | null = null,
  projectName?: string | null,
): void {
  pi.registerTool({
    name: "memory",
    label: "Memory",
    description: MEMORY_TOOL_DESCRIPTION,
    promptSnippet:
      "Save or manage persistent memory that survives across sessions",
    promptGuidelines: [
      "Use the memory tool proactively when the user corrects you, shares a preference, or reveals personal details worth remembering.",
      "Use the memory tool when you discover environment facts, workspace conventions, or reusable patterns useful in future sessions.",
      "Use scope='workspace' for repository- or workspace-specific facts; legacy target='project' is accepted as an alias.",
      "Do NOT use memory for temporary task state, TODO items, or session progress — only for durable, cross-session facts.",
      "Use target='failure' with category to save what didn't work (failures, corrections, insights).",
    ],
    parameters: Type.Object({
      action: StringEnum(["add", "replace", "remove"] as const),
      target: StringEnum(["memory", "user", "project", "failure"] as const),
      scope: Type.Optional(StringEnum(["global", "workspace", "project"] as const, {
        description: "Canonical scope for this memory. Use 'global' for Global Base and 'workspace' for Current Workspace Overlay. Legacy 'project' is accepted as an alias for 'workspace'.",
      })),
      content: Type.Optional(
        Type.String({ description: "Entry content for add/replace" })
      ),
      old_text: Type.Optional(
        Type.String({
          description:
            "Substring identifying entry for replace/remove",
        })
      ),
      category: Type.Optional(
        StringEnum(["failure", "correction", "insight", "preference", "convention", "tool-quirk"] as const, {
          description: "Category for failure memories",
        })
      ),
      failure_reason: Type.Optional(
        Type.String({ description: "Why it failed (for failure category)" })
      ),
    }),
    async execute(toolCallId, params, signal, onUpdate, ctx) {
      const { action, target: rawTarget, scope: rawScope, content, old_text, category, failure_reason } = params as {
        action: "add" | "replace" | "remove";
        target: MemoryToolTarget;
        scope?: MemoryToolScope;
        content?: string;
        old_text?: string;
        category?: MemoryCategory;
        failure_reason?: string;
      };
      const route = normalizeMemoryRoute(rawTarget, rawScope, projectName);

      const activeStore = route.scope === "workspace" ? projectStore : store;

      if (route.scope === "workspace" && !projectStore) {
        return {
          content: [{ type: "text", text: JSON.stringify({ success: false, error: "Workspace memory is not available (no workspace detected)." }) }],
          details: {},
        };
      }

      if (route.scope === "workspace" && route.target === "user") {
        const error = { success: false, error: "Workspace user memory is not supported. Use scope='global', target='user' for user profile facts." };
        return {
          content: [{ type: "text", text: JSON.stringify(error) }],
          details: error,
        };
      }

      const store_ = activeStore!;

      let result: MemoryResult;
      let syncWarning: string | null = null;
      switch (action) {
        case "add":
          if (!content) {
            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify({
                    success: false,
                    error: "Content is required for 'add' action.",
                  }),
                },
              ],
              details: {},
            };
          }
          // Handle failure target with category
          if (rawTarget === "failure") {
            const memoryCategory = (category || "failure") as MemoryCategory;
            result = await store_.addFailure(content, {
              category: memoryCategory,
              failureReason: failure_reason,
            });
            if (result.success) {
              syncWarning = await syncAddToSqlite(route, content, memoryCategory, failure_reason, dbManager);
            }
          } else {
            result = await store_.add(route.target, content);
            if (result.success) {
              await syncEvictionsFromSqlite(route, result.evicted_entries, dbManager);
              syncWarning = await syncAddToSqlite(route, content, undefined, undefined, dbManager);
            }
          }
          break;

        case "replace":
          if (!old_text) {
            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify({
                    success: false,
                    error: "old_text is required for 'replace' action.",
                  }),
                },
              ],
              details: {},
            };
          }
          if (!content) {
            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify({
                    success: false,
                    error: "content is required for 'replace' action.",
                  }),
                },
              ],
              details: {},
            };
          }
          result = await store_.replace(route.target, old_text, content);
          if (result.success) {
            syncWarning = await syncReplaceToSqlite(route, old_text, content, dbManager);
          }
          break;

        case "remove":
          if (!old_text) {
            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify({
                    success: false,
                    error: "old_text is required for 'remove' action.",
                  }),
                },
              ],
              details: {},
            };
          }
          result = await store_.remove(route.target, old_text);
          if (result.success) {
            syncWarning = await syncRemoveFromSqlite(route, old_text, dbManager);
          }
          break;

        default:
          result = {
            success: false,
            error: `Unknown action '${action}'. Use: add, replace, remove`,
          };
      }

      if (syncWarning && result.success) {
        result = appendSyncWarning(result, syncWarning);
      }

      if (route.scope === "workspace" && result.success) {
        result = {
          ...result,
          target: route.legacyProjectTarget ? "project" : route.target,
        };
      }

      return {
        content: [{ type: "text", text: formatMemoryToolText(result) }],
        details: result,
      };
    },
  });
}
