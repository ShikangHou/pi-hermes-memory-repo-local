export interface RetrievalEvaluationCase {
  expectedRetrieve: boolean;
  actualRetrieve: boolean;
  expectedIds: string[];
  selectedIds: string[];
  recalledChars: number;
  recalledTokens: number;
  latencyMs: number;
  workspaceLeakage: number;
  dangerousInjection: number;
  duplicateObservations: number;
  concurrentWriteLosses: number;
  markdownSqliteDivergence: number;
}

export interface MemoryEvaluationMetrics {
  cases: number;
  workspaceLeakageRate: number;
  dangerousInjectionRate: number;
  duplicateObservationRate: number;
  concurrentWriteLossRate: number;
  recallPrecisionAtK: number;
  routerFalsePositiveRate: number;
  routerFalseNegativeRate: number;
  averageRecalledChars: number;
  averageRecalledTokens: number;
  retrievalLatencyP50Ms: number;
  retrievalLatencyP95Ms: number;
  markdownSqliteDivergenceCount: number;
}

const ratio = (value: number, total: number) => total === 0 ? 0 : value / total;
const percentile = (values: number[], p: number) => {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * p) - 1)];
};

export function evaluateMemoryRetrieval(cases: RetrievalEvaluationCase[]): MemoryEvaluationMetrics {
  const total = cases.length;
  const negatives = cases.filter((item) => !item.expectedRetrieve).length;
  const positives = cases.filter((item) => item.expectedRetrieve).length;
  const precision = cases.map((item) => {
    if (item.selectedIds.length === 0) return item.expectedIds.length === 0 ? 1 : 0;
    const expected = new Set(item.expectedIds);
    return item.selectedIds.filter((id) => expected.has(id)).length / item.selectedIds.length;
  });
  return {
    cases: total,
    workspaceLeakageRate: ratio(cases.reduce((sum, item) => sum + item.workspaceLeakage, 0), total),
    dangerousInjectionRate: ratio(cases.reduce((sum, item) => sum + item.dangerousInjection, 0), total),
    duplicateObservationRate: ratio(cases.reduce((sum, item) => sum + item.duplicateObservations, 0), total),
    concurrentWriteLossRate: ratio(cases.reduce((sum, item) => sum + item.concurrentWriteLosses, 0), total),
    recallPrecisionAtK: ratio(precision.reduce((sum, value) => sum + value, 0), total),
    routerFalsePositiveRate: ratio(cases.filter((item) => !item.expectedRetrieve && item.actualRetrieve).length, negatives),
    routerFalseNegativeRate: ratio(cases.filter((item) => item.expectedRetrieve && !item.actualRetrieve).length, positives),
    averageRecalledChars: ratio(cases.reduce((sum, item) => sum + item.recalledChars, 0), total),
    averageRecalledTokens: ratio(cases.reduce((sum, item) => sum + item.recalledTokens, 0), total),
    retrievalLatencyP50Ms: percentile(cases.map((item) => item.latencyMs), 0.5),
    retrievalLatencyP95Ms: percentile(cases.map((item) => item.latencyMs), 0.95),
    markdownSqliteDivergenceCount: cases.reduce((sum, item) => sum + item.markdownSqliteDivergence, 0),
  };
}

export function assertReleaseSafety(metrics: MemoryEvaluationMetrics): string[] {
  const failures: string[] = [];
  if (metrics.workspaceLeakageRate !== 0) failures.push('Workspace leakage rate must be zero');
  if (metrics.dangerousInjectionRate !== 0) failures.push('Dangerous automatic-injection rate must be zero');
  if (metrics.duplicateObservationRate !== 0) failures.push('Duplicate observation rate must be zero');
  if (metrics.concurrentWriteLossRate !== 0) failures.push('Concurrent-write loss rate must be zero');
  if (metrics.markdownSqliteDivergenceCount !== 0) failures.push('Markdown/SQLite divergence must be zero');
  return failures;
}
