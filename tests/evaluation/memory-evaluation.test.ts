import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { assertReleaseSafety, evaluateMemoryRetrieval, type RetrievalEvaluationCase } from '../../src/evaluation/memory-evaluation.js';

describe('v0.8 retrieval evaluation metrics', () => {
  const safeCase: RetrievalEvaluationCase = {
    expectedRetrieve: true, actualRetrieve: true, expectedIds: ['correction'], selectedIds: ['correction'],
    recalledChars: 400, recalledTokens: 100, latencyMs: 8, workspaceLeakage: 0, dangerousInjection: 0,
    duplicateObservations: 0, concurrentWriteLosses: 0, markdownSqliteDivergence: 0,
  };
  it('computes precision, router rates, budgets, latency percentiles, and zero-harm gates', () => {
    const metrics = evaluateMemoryRetrieval([
      safeCase,
      { ...safeCase, expectedRetrieve: false, actualRetrieve: false, expectedIds: [], selectedIds: [], recalledChars: 0, recalledTokens: 0, latencyMs: 2 },
      { ...safeCase, latencyMs: 20 },
    ]);
    assert.equal(metrics.recallPrecisionAtK, 1);
    assert.equal(metrics.routerFalsePositiveRate, 0);
    assert.equal(metrics.routerFalseNegativeRate, 0);
    assert.equal(metrics.retrievalLatencyP50Ms, 8);
    assert.equal(metrics.retrievalLatencyP95Ms, 20);
    assert.deepStrictEqual(assertReleaseSafety(metrics), []);
  });
  it('fails release gates for leakage, dangerous injection, duplicate observation, or divergence', () => {
    const metrics = evaluateMemoryRetrieval([{ ...safeCase, workspaceLeakage: 1, dangerousInjection: 1, duplicateObservations: 1, concurrentWriteLosses: 1, markdownSqliteDivergence: 1 }]);
    assert.equal(assertReleaseSafety(metrics).length, 5);
  });
});
