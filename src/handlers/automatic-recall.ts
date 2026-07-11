import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import type { MemoryConfig } from '../types.js';
import type { DatabaseManager } from '../store/db.js';
import { recordMemoryAccess, searchMemories } from '../store/sqlite-memory-store.js';
import { routeMemory } from './memory-router.js';
import { rankMemoryCandidates } from '../store/memory-ranking.js';
import { packMemoryCandidates } from '../store/memory-budget-packer.js';
import { validateMemoryContent } from '../security/memory-validation.js';

export interface CandidateTrace { id: string; score: number; selected: boolean; reason?: string; }
export interface RecallTrace {
  routerDecision: 'retrieve' | 'skip'; routerReasons: string[]; query: string;
  workspaceId: string | null; candidateCount: number; candidates: CandidateTrace[];
  selectedIds: string[]; budgetChars: number; budgetTokens: number; elapsedMs: number;
}

export function setupAutomaticRecall(
  pi: ExtensionAPI,
  db: DatabaseManager,
  config: MemoryConfig,
  resolveWorkspaceId: (cwd?: string) => Promise<string | null>,
): { getLastTrace(): RecallTrace | null } {
  let lastTrace: RecallTrace | null = null;
  const mode = config.autoRecallEnabled === true ? config.autoRecallMode ?? 'off' : 'off';
  pi.on('before_agent_start', async (event, ctx) => {
    const started = Date.now();
    const prompt = String((event as { prompt?: unknown }).prompt ?? '');
    const workspaceId = await resolveWorkspaceId(ctx.cwd);
    const routed = routeMemory(prompt);
    if (mode === 'off' || routed.decision === 'skip') {
      lastTrace = { routerDecision: 'skip', routerReasons: mode === 'off' ? ['mode-off'] : routed.reasons, query: routed.query,
        workspaceId, candidateCount: 0, candidates: [], selectedIds: [], budgetChars: 0, budgetTokens: 0, elapsedMs: Date.now() - started };
      return;
    }
    try {
      const limit = Math.max(1, (config.autoRecallTopK ?? 6) * 3);
      const rows = [
        ...searchMemories(db, routed.query, { project: null, limit }),
        ...(workspaceId ? searchMemories(db, routed.query, { workspaceId, limit }) : []),
      ].filter((row) => validateMemoryContent(row.content, { source: `auto-recall:${row.id}`, trustLevel: 'untrusted', phase: 'recall' }).accepted);
      const ranked = rankMemoryCandidates(rows.map((row) => ({ id: row.memoryUid ?? String(row.id), content: row.content,
        workspaceId: row.workspaceId, category: row.category, created: row.created, lastReferenced: row.lastReferenced })), workspaceId);
      const packed = packMemoryCandidates(ranked, workspaceId, { topK: config.autoRecallTopK ?? 6,
        maxChars: config.autoRecallBudgetChars ?? 6000, maxEntryChars: config.autoRecallMaxEntryChars ?? 1500,
        maxTokens: config.autoRecallMaxTokens ?? 1500 });
      lastTrace = { routerDecision: routed.decision, routerReasons: routed.reasons, query: routed.query, workspaceId,
        candidateCount: ranked.length, candidates: ranked.map((candidate) => ({ id: candidate.id, score: candidate.finalScore,
          selected: packed.selected.some((item) => item.id === candidate.id), reason: packed.excluded.find((item) => item.id === candidate.id)?.reason })),
        selectedIds: packed.selected.map((item) => item.id), budgetChars: packed.chars, budgetTokens: packed.estimatedTokens,
        elapsedMs: Date.now() - started };
      if ((mode === 'auto' || mode === 'debug') && packed.selected.length) {
        const selected = new Set(packed.selected.map((item) => item.id));
        recordMemoryAccess(db, rows.filter((row) => selected.has(row.memoryUid ?? String(row.id))).map((row) => row.id));
      }
      if ((mode === 'auto' || mode === 'debug') && packed.text) return { systemPrompt: event.systemPrompt + '\n\n' + packed.text };
    } catch {
      lastTrace = { routerDecision: routed.decision, routerReasons: [...routed.reasons, 'retrieval-failed'], query: routed.query,
        workspaceId, candidateCount: 0, candidates: [], selectedIds: [], budgetChars: 0, budgetTokens: 0, elapsedMs: Date.now() - started };
    }
  });
  const render = () => lastTrace ? JSON.stringify(lastTrace, null, 2) : 'No recall has run yet.';
  for (const name of ['memory-why', 'memory-debug-last']) pi.registerCommand(name, { description: 'Explain the most recent memory recall', handler: async (_args, ctx) => ctx.ui.notify(render(), 'info') });
  pi.registerCommand('memory-status', { description: 'Show automatic recall status', handler: async (_args, ctx) => ctx.ui.notify(`Automatic recall mode: ${mode}`, 'info') });
  return { getLastTrace: () => lastTrace };
}
