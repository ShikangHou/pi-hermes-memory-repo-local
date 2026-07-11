import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  MEMORY_CHECKPOINT_CUSTOM_TYPE,
  buildMemoryCheckpoint,
  recoverMemoryCheckpoint,
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
});
