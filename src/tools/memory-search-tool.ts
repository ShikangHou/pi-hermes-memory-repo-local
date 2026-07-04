import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { StringEnum } from "@earendil-works/pi-ai";
import { DatabaseManager } from '../store/db.js';
import { searchMemories, getMemoryStats } from '../store/sqlite-memory-store.js';
import type { MemoryCategory } from '../types.js';

interface SearchResult {
  success: boolean;
  count?: number;
  message?: string;
  output?: string;
}

type SearchScope = 'global' | 'workspace' | 'all' | 'project';

export function registerMemorySearchTool(pi: ExtensionAPI, dbManager: DatabaseManager, currentWorkspaceId?: string | null): void {
  pi.registerTool({
    name: 'memory_search',
    label: 'Memory Search',
    description: `Search extended memory store for relevant entries. Use this when you need context beyond what's in the system prompt — the extended store has unlimited capacity and is searchable.

Use cases:
- Find memories about a specific topic: "What do I know about auth setup?"
- Search workspace-specific memories: "What conventions does this workspace follow?"
- Find user preferences: "What are the user's testing preferences?"
- Search for past failures: "memory_search('auth', category='failure')"

Returns matching memory entries with workspace context and dates.`,
    promptSnippet: 'Search extended memory store (unlimited capacity)',
    promptGuidelines: [
      'Use memory_search when you need context beyond what is in the system prompt.',
      'Use memory_search to find current workspace memories or user preferences.',
      "Default scope='all' searches Global plus Current Workspace only, never every historical workspace.",
      'Use memory_search with category filter to find specific types of memories (failure, correction, insight, etc.).',
    ],
    parameters: Type.Object({
      query: Type.String({ description: 'Search query. Use natural language or specific terms.' }),
      scope: Type.Optional(StringEnum(['global', 'workspace', 'all', 'project'] as const, { description: "Search scope. Default 'all' means Global plus Current Workspace. Legacy 'project' is an alias for 'workspace'." })),
      project: Type.Optional(Type.String({ description: 'Legacy exact project filter. Prefer scope instead.' })),
      target: Type.Optional(StringEnum(['memory', 'user', 'failure'] as const, { description: 'Filter by target type (memory, user, or failure).' })),
      category: Type.Optional(StringEnum(['failure', 'correction', 'insight', 'preference', 'convention', 'tool-quirk'] as const, { description: 'Filter by memory category.' })),
      limit: Type.Optional(Type.Number({ description: 'Maximum results to return (default: 10, max: 20).' })),
    }),
    execute: async (_id: string, args: { query: string; scope?: SearchScope; project?: string; target?: string; category?: string; limit?: number }) => {
      const query = args.query;
      const target = args.target;
      const category = args.category as MemoryCategory | undefined;
      const limit = Math.min(args.limit || 10, 20);
      const scope = args.scope === 'project' ? 'workspace' : args.scope ?? 'all';

      if (!query || query.trim().length === 0) {
        const result: SearchResult = { success: false, message: 'query is required' };
        return { content: [{ type: 'text' as const, text: result.message! }], details: result };
      }

      const stats = getMemoryStats(dbManager);
      if (stats.total === 0) {
        const result: SearchResult = { success: false, message: 'No memories in extended store yet. Use the memory tool with add action to store memories.' };
        return { content: [{ type: 'text' as const, text: result.message! }], details: result };
      }

      const workspaceId = currentWorkspaceId?.trim() || null;
      const searchOptions = { target, category, limit };
      const results = args.project !== undefined
        ? searchMemories(dbManager, query, { ...searchOptions, project: args.project, limit })
        : scope === 'global'
          ? searchMemories(dbManager, query, { ...searchOptions, project: null, limit })
          : scope === 'workspace'
            ? workspaceId
              ? searchMemories(dbManager, query, { ...searchOptions, project: workspaceId, limit })
              : []
            : [
                ...searchMemories(dbManager, query, { ...searchOptions, project: null, limit }),
                ...(workspaceId ? searchMemories(dbManager, query, { ...searchOptions, project: workspaceId, limit }) : []),
              ].slice(0, limit);

      if (results.length === 0) {
        const result: SearchResult = { success: true, count: 0, message: `No memories found matching "${query}". Try a different search term or broader query.` };
        return { content: [{ type: 'text' as const, text: result.message! }], details: result };
      }

      let output = `Found ${results.length} memories matching "${query}":\n\n`;

      for (const entry of results) {
        const projectLabel = entry.project ? `[workspace:${entry.project}]` : '[global]';
        const targetLabel = entry.target === 'user' ? '👤' : entry.target === 'failure' ? '⚠️' : '🧠';
        const categoryLabel = entry.category ? ` [${entry.category}]` : '';
        output += `${targetLabel} ${projectLabel}${categoryLabel} ${entry.content}\n`;
        output += `   Created: ${entry.created} | Last used: ${entry.lastReferenced}\n\n`;
      }

      const finalResult: SearchResult = { success: true, count: results.length, output: output.trim() };
      return { content: [{ type: 'text' as const, text: output.trim() }], details: finalResult };
    },
  });
}
