import { describe, expect, it } from 'vitest';
import { buildBenchmarkReport } from '../benchmark/report.js';

describe('FEATURE086 - Benchmark Report Ranking', () => {
  it('Test ranking weights', () => {
    const results = [
      { modelId: 'cheap', status: 'passed' as const, success: true, turns: 2, costUsd: 0.1, durationMs: 2000, qualityScore: 80, local: false },
      { modelId: 'quality', status: 'passed' as const, success: true, turns: 2, costUsd: 0.5, durationMs: 1000, qualityScore: 98, local: true },
      { modelId: 'failed', status: 'failed' as const, success: false, turns: 0, costUsd: 0, durationMs: 1, qualityScore: 100, local: true },
    ];
    const original = results.map(result => ({ ...result }));

    const report = buildBenchmarkReport(results);

    expect(report.bestOverall?.modelId).toBe('quality');
    expect(report.bestLocal?.modelId).toBe('quality');
    expect(report.cheapest?.modelId).toBe('cheap');
    expect(report.fastest?.modelId).toBe('quality');
    expect(report.rows.find(row => row.modelId === 'failed')?.compositeScore).toBe(0);
    expect(results).toEqual(original);
  });

  it('Test all failed models', () => {
    const report = buildBenchmarkReport([
      { modelId: 'a', status: 'failed', success: false, turns: 0, costUsd: 0, durationMs: 1 },
      { modelId: 'b', status: 'skipped', success: false, turns: 0, costUsd: 0, durationMs: 1 },
    ]);

    expect(report.rows).toHaveLength(2);
    expect(report.bestOverall).toBeUndefined();
    expect(report.cheapest).toBeUndefined();
    expect(report.fastest).toBeUndefined();
  });

  it('Test missing local model', () => {
    const report = buildBenchmarkReport([
      { modelId: 'api', status: 'passed', success: true, turns: 1, costUsd: 0.2, durationMs: 100, local: false },
    ]);

    expect(report.bestOverall?.modelId).toBe('api');
    expect(report.bestLocal).toBeUndefined();
  });
});
