import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  MEMORY_CHECKPOINT_CUSTOM_TYPE,
  buildMemoryCheckpoint,
  recoverMemoryCheckpoint,
  setupObservationCheckpoints,
} from '../../src/handlers/observation-checkpoint.js';

describe('observation checkpoints', () => {
  it('builds a cursor at the latest observable session entry', () => {
    const checkpoint = buildMemoryCheckpoint([
      { type: 'message', id: 'msg-1' },
      { type: 'custom', id: 'checkpoint-old', customType: MEMORY_CHECKPOINT_CUSTOM_TYPE },
      { type: 'message', id: 'msg-2' },
    ], 'workspace-a', null);

    assert.strictEqual(checkpoint?.lastObservedEntryId, 'msg-2');
    assert.strictEqual(checkpoint?.lastObservedSequence, 2);
    assert.strictEqual(checkpoint?.workspaceId, 'workspace-a');
  });

  it('recovers the latest valid checkpoint and ignores unrelated custom entries', () => {
    const oldCheckpoint = {
      version: 1 as const, workspaceId: null, lastObservedEntryId: 'msg-1', lastObservedSequence: 0,
    };
    const latestCheckpoint = {
      version: 1 as const, workspaceId: 'workspace-a', lastObservedEntryId: 'msg-4', lastObservedSequence: 4,
      lastCompactionId: 'compact-1', compactionPhase: 'after' as const,
    };
    const recovered = recoverMemoryCheckpoint([
      { type: 'custom', customType: MEMORY_CHECKPOINT_CUSTOM_TYPE, data: oldCheckpoint },
      { type: 'custom', customType: 'another-extension', data: latestCheckpoint },
      { type: 'custom', customType: MEMORY_CHECKPOINT_CUSTOM_TYPE, data: latestCheckpoint },
    ]);
    assert.deepStrictEqual(recovered, latestCheckpoint);
  });

  it('preserves compaction identity across before and after checkpoints', () => {
    const before = buildMemoryCheckpoint([{ type: 'message', id: 'msg-1' }], 'workspace-a', null, {
      lastFlushId: 'compact-1', lastCompactionId: 'compact-1', compactionPhase: 'before',
    });
    const after = buildMemoryCheckpoint([{ type: 'message', id: 'msg-1' }], 'workspace-a', before, {
      lastCompactionId: before?.lastCompactionId, compactionPhase: 'after',
    });
    assert.strictEqual(after?.lastCompactionId, 'compact-1');
    assert.strictEqual(after?.compactionPhase, 'after');
  });

  it('consumes only the compacted range and never offers it twice', async () => {
    const handlers: Record<string, Function[]> = {};
    const appended: any[] = [];
    const pi = {
      on(event: string, handler: Function) {
        (handlers[event] ??= []).push(handler);
      },
      appendEntry(customType: string, data: unknown) {
        appended.push({ type: 'custom', customType, data });
      },
    } as any;
    const controller = setupObservationCheckpoints(pi, async () => 'workspace-a');
    const entries = [
      { type: 'message', id: 'msg-1' },
      { type: 'message', id: 'msg-2' },
      { type: 'message', id: 'msg-3' },
    ];
    const event = {
      branchEntries: entries,
      preparation: { firstKeptEntryId: 'msg-3', tokensBefore: 120 },
    };
    const ctx = { sessionManager: { getEntries: () => entries }, getContextUsage: () => ({ tokens: 35 }) };

    await handlers.session_before_compact[0](event, ctx);
    const range = controller.getExtractionRange(event);
    assert.deepStrictEqual(range?.entries.map((entry) => entry.id), ['msg-1', 'msg-2']);
    controller.markExtractionConsumed(range!);

    assert.strictEqual(controller.getExtractionRange(event), null);
    assert.strictEqual(controller.getCheckpoint()?.lastExtractedEntryId, 'msg-2');
    assert.ok(appended.some((entry) => entry.data.compactionPhase === 'before'));
  });

  it('records the archived range and compaction token delta after compaction', async () => {
    const handlers: Record<string, Function[]> = {};
    const appended: any[] = [];
    const pi = {
      on(event: string, handler: Function) { (handlers[event] ??= []).push(handler); },
      appendEntry(customType: string, data: unknown) { appended.push({ customType, data }); },
    } as any;
    const controller = setupObservationCheckpoints(pi, async () => 'workspace-a');
    const entries = [
      { type: 'message', id: 'msg-1' },
      { type: 'message', id: 'msg-2' },
    ];
    const ctx = { sessionManager: { getEntries: () => entries }, getContextUsage: () => ({ tokens: 35 }) };
    const before = { branchEntries: entries, preparation: { firstKeptEntryId: 'msg-2', tokensBefore: 100 } };
    await handlers.session_before_compact[0](before, ctx);
    const range = controller.getExtractionRange(before)!;
    controller.markExtractionConsumed(range);
    await handlers.session_compact[0]({ compactionEntry: { id: 'summary-1', tokensBefore: 100 } }, ctx);

    const after = appended.at(-1).data;
    assert.strictEqual(after.compactionPhase, 'after');
    assert.strictEqual(after.archivedStartEntryId, 'msg-1');
    assert.strictEqual(after.archivedEndEntryId, 'msg-1');
    assert.strictEqual(after.tokenDelta, 65);
  });
});
