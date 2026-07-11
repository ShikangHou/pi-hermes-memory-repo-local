import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseManager } from '../../src/store/db.js';
import { addMemory } from '../../src/store/sqlite-memory-store.js';
import { setupAutomaticRecall } from '../../src/handlers/automatic-recall.js';

function mockPi() {
  const handlers: Record<string, Function[]> = {}; const commands: Record<string, any> = {};
  return { pi: { on(e: string, h: Function) { (handlers[e] ??= []).push(h); }, registerCommand(n: string, c: any) { commands[n] = c; } } as any, handlers, commands };
}

describe('automatic recall', () => {
  it('defaults to off, injects nothing, and registers explainability commands', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'recall-off-')); const db = new DatabaseManager(dir);
    try {
      const mock = mockPi(); const state = setupAutomaticRecall(mock.pi, db, { autoRecallEnabled: false } as any, async () => 'a');
      const result = await mock.handlers.before_agent_start[0]({ prompt: 'remember the build failure', systemPrompt: 'base' }, { cwd: '/x' });
      assert.equal(result, undefined); assert.deepStrictEqual(state.getLastTrace()?.routerReasons, ['mode-off']);
      assert.ok(mock.commands['memory-why']); assert.ok(mock.commands['memory-debug-last']); assert.ok(mock.commands['memory-status']);
    } finally { db.close(); fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it('suggest traces candidates without injection while auto injects a bounded block', async () => {
    for (const mode of ['suggest', 'auto'] as const) {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), `recall-${mode}-`)); const db = new DatabaseManager(dir);
      try {
        addMemory(db, 'Build failure requires npm test retry', 'failure', 'repo', 'failure', null, null, null, '2026-01-01', '2026-01-02', 'a', 'repo', `mem-${mode}`);
        const mock = mockPi(); const state = setupAutomaticRecall(mock.pi, db, { autoRecallEnabled: true, autoRecallMode: mode,
          autoRecallTopK: 2, autoRecallBudgetChars: 600, autoRecallMaxEntryChars: 100, autoRecallMaxTokens: 150 } as any, async () => 'a');
        const result = await mock.handlers.before_agent_start[0]({ prompt: 'Why did the build failure happen?', systemPrompt: 'base' }, { cwd: '/x' });
        assert.equal(state.getLastTrace()?.selectedIds.length, 1);
        if (mode === 'suggest') assert.equal(result, undefined);
        else assert.match(result.systemPrompt, /<retrieved-memory/);
      } finally { db.close(); fs.rmSync(dir, { recursive: true, force: true }); }
    }
  });
});
