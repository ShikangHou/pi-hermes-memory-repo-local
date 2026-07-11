import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';

export const MEMORY_CHECKPOINT_CUSTOM_TYPE = 'pi-context-memory/checkpoint';

export interface MemoryCheckpoint {
  version: 1;
  workspaceId: string | null;
  lastObservedEntryId: string;
  lastObservedSequence: number;
  lastFlushId?: string;
  lastCompactionId?: string;
  compactionPhase?: 'before' | 'after';
}

type SessionEntry = {
  type?: unknown;
  id?: unknown;
  customType?: unknown;
  data?: unknown;
};

function isCheckpoint(value: unknown): value is MemoryCheckpoint {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<MemoryCheckpoint>;
  return candidate.version === 1
    && (typeof candidate.workspaceId === 'string' || candidate.workspaceId === null)
    && typeof candidate.lastObservedEntryId === 'string'
    && Number.isInteger(candidate.lastObservedSequence)
    && candidate.lastObservedSequence! >= 0;
}

export function recoverMemoryCheckpoint(entries: SessionEntry[]): MemoryCheckpoint | null {
  for (let index = entries.length - 1; index >= 0; index--) {
    const entry = entries[index];
    if (entry?.type === 'custom' && entry.customType === MEMORY_CHECKPOINT_CUSTOM_TYPE && isCheckpoint(entry.data)) {
      return entry.data;
    }
  }
  return null;
}

export function buildMemoryCheckpoint(
  entries: SessionEntry[],
  workspaceId: string | null,
  previous: MemoryCheckpoint | null,
  extra: Pick<MemoryCheckpoint, 'lastFlushId' | 'lastCompactionId' | 'compactionPhase'> = {},
): MemoryCheckpoint | null {
  let sequence = -1;
  let lastObservedEntryId = '';
  for (let index = 0; index < entries.length; index++) {
    const entry = entries[index];
    if (entry?.type === 'custom' && entry.customType === MEMORY_CHECKPOINT_CUSTOM_TYPE) continue;
    if (typeof entry?.id !== 'string') continue;
    sequence = index;
    lastObservedEntryId = entry.id;
  }
  if (sequence < 0) return previous;
  return {
    version: 1,
    workspaceId,
    lastObservedEntryId,
    lastObservedSequence: sequence,
    lastFlushId: extra.lastFlushId ?? previous?.lastFlushId,
    lastCompactionId: extra.lastCompactionId ?? previous?.lastCompactionId,
    compactionPhase: extra.compactionPhase,
  };
}

export function setupObservationCheckpoints(
  pi: ExtensionAPI,
  resolveWorkspaceId: (cwd?: string) => Promise<string | null>,
): void {
  let checkpoint: MemoryCheckpoint | null = null;

  const append = async (
    ctx: { cwd?: string; sessionManager: { getEntries(): SessionEntry[] } },
    extra: Pick<MemoryCheckpoint, 'lastFlushId' | 'lastCompactionId' | 'compactionPhase'> = {},
  ) => {
    const next = buildMemoryCheckpoint(ctx.sessionManager.getEntries(), await resolveWorkspaceId(ctx.cwd), checkpoint, extra);
    if (!next) return;
    if (next.lastObservedEntryId === checkpoint?.lastObservedEntryId && !extra.compactionPhase && !extra.lastFlushId) return;
    checkpoint = next;
    pi.appendEntry(MEMORY_CHECKPOINT_CUSTOM_TYPE, next);
  };

  pi.on('session_start', async (_event, ctx) => {
    checkpoint = recoverMemoryCheckpoint(ctx.sessionManager.getEntries() as SessionEntry[]);
  });
  pi.on('turn_end', async (_event, ctx) => append(ctx));
  pi.on('session_before_compact', async (_event, ctx) => {
    const id = `compact-${Date.now()}`;
    await append(ctx, { lastFlushId: id, lastCompactionId: id, compactionPhase: 'before' });
  });
  pi.on('session_compact', async (_event, ctx) => {
    await append(ctx, { lastCompactionId: checkpoint?.lastCompactionId, compactionPhase: 'after' });
  });
}
