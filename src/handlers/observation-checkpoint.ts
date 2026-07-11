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
  extractionStartEntryId?: string;
  extractionEndEntryId?: string;
  lastExtractedEntryId?: string;
  archivedStartEntryId?: string;
  archivedEndEntryId?: string;
  tokensBefore?: number;
  tokensAfter?: number;
  tokenDelta?: number;
}

export interface ExtractionRange {
  compactionId: string;
  startEntryId: string;
  endEntryId: string;
  entries: SessionEntry[];
}

type SessionEntry = {
  type?: unknown;
  id?: unknown;
  customType?: unknown;
  data?: unknown;
};

type CompactionEvent = {
  preparation?: { firstKeptEntryId?: string; tokensBefore?: number };
  branchEntries?: SessionEntry[];
  compactionEntry?: { id?: string; tokensBefore?: number };
};

export interface ObservationCheckpointController {
  getCheckpoint(): MemoryCheckpoint | null;
  getExtractionRange(event: CompactionEvent): ExtractionRange | null;
  markExtractionConsumed(range: ExtractionRange): void;
}

function deriveExtractionRange(
  event: CompactionEvent,
  lastExtractedId?: string,
): ExtractionRange | null {
  const entries = event.branchEntries ?? [];
  const firstKeptId = event.preparation?.firstKeptEntryId;
  const boundary = firstKeptId ? entries.findIndex((entry) => entry.id === firstKeptId) : entries.length;
  const compacted = entries.slice(0, boundary < 0 ? entries.length : boundary)
    .filter((entry) => entry.type === 'message' && typeof entry.id === 'string');
  const consumedIndex = lastExtractedId
    ? compacted.findIndex((entry) => entry.id === lastExtractedId)
    : -1;
  const pending = compacted.slice(consumedIndex + 1);
  const start = pending[0]?.id;
  const end = pending[pending.length - 1]?.id;
  if (typeof start !== 'string' || typeof end !== 'string') return null;
  return {
    compactionId: `compact-${start}-${end}`,
    startEntryId: start,
    endEntryId: end,
    entries: pending,
  };
}

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
  extra: Partial<MemoryCheckpoint> = {},
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
    extractionStartEntryId: extra.extractionStartEntryId ?? previous?.extractionStartEntryId,
    extractionEndEntryId: extra.extractionEndEntryId ?? previous?.extractionEndEntryId,
    lastExtractedEntryId: extra.lastExtractedEntryId ?? previous?.lastExtractedEntryId,
    archivedStartEntryId: extra.archivedStartEntryId,
    archivedEndEntryId: extra.archivedEndEntryId,
    tokensBefore: extra.tokensBefore ?? previous?.tokensBefore,
    tokensAfter: extra.tokensAfter,
    tokenDelta: extra.tokenDelta,
  };
}

export function setupObservationCheckpoints(
  pi: ExtensionAPI,
  resolveWorkspaceId: (cwd?: string) => Promise<string | null>,
): ObservationCheckpointController {
  let checkpoint: MemoryCheckpoint | null = null;
  const inFlightRanges = new Set<string>();

  const append = async (
    ctx: { cwd?: string; sessionManager: { getEntries(): SessionEntry[] } },
    extra: Partial<MemoryCheckpoint> = {},
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
    const event = _event as CompactionEvent;
    const range = deriveExtractionRange(event, checkpoint?.lastExtractedEntryId);
    const id = range?.compactionId ?? `compact-${Date.now()}`;
    await append(ctx, {
      lastFlushId: id,
      lastCompactionId: id,
      compactionPhase: 'before',
      extractionStartEntryId: range?.startEntryId,
      extractionEndEntryId: range?.endEntryId,
      tokensBefore: event.preparation?.tokensBefore,
    });
  });
  pi.on('session_compact', async (_event, ctx) => {
    const tokensAfter = ctx.getContextUsage?.()?.tokens ?? undefined;
    await append(ctx, {
      lastCompactionId: checkpoint?.lastCompactionId,
      compactionPhase: 'after',
      archivedStartEntryId: checkpoint?.extractionStartEntryId,
      archivedEndEntryId: checkpoint?.extractionEndEntryId,
      tokensBefore: checkpoint?.tokensBefore,
      tokensAfter,
      tokenDelta: typeof checkpoint?.tokensBefore === 'number' && typeof tokensAfter === 'number'
        ? checkpoint.tokensBefore - tokensAfter
        : undefined,
    });
  });

  const controller: ObservationCheckpointController = {
    getCheckpoint: () => checkpoint,
    getExtractionRange(event) {
      const range = deriveExtractionRange(event, checkpoint?.lastExtractedEntryId);
      if (!range || inFlightRanges.has(range.compactionId)) return null;
      inFlightRanges.add(range.compactionId);
      return range;
    },
    markExtractionConsumed(range) {
      inFlightRanges.delete(range.compactionId);
      checkpoint = {
        ...(checkpoint ?? {
          version: 1,
          workspaceId: null,
          lastObservedEntryId: range.endEntryId,
          lastObservedSequence: 0,
        }),
        lastFlushId: range.compactionId,
        lastExtractedEntryId: range.endEntryId,
        extractionStartEntryId: range.startEntryId,
        extractionEndEntryId: range.endEntryId,
      };
      pi.appendEntry(MEMORY_CHECKPOINT_CUSTOM_TYPE, checkpoint);
    },
  };

  return controller;
}
