import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { writeAnalyticsExport } from '../analytics/export.js';
import { closeDatabase, initDatabase } from '../db/connection.js';
import { getComparisonReport, getCostTrend, getReportData } from '../db/queries/analytics.js';

const dirs: string[] = [];
afterEach(() => { closeDatabase(); dirs.splice(0).forEach(dir => rmSync(dir, { recursive: true, force: true })); });

function database() {
  const dir = mkdtempSync(path.join(tmpdir(), 'dev-loop-report-')); dirs.push(dir);
  return initDatabase(path.join(dir, 'dev-loop.db'));
}

describe('FEATURE115 reporting contract', () => {
  it('returns exact zero metrics for empty comparison ranges', async () => {
    database();
    const report = await getComparisonReport({
      from1: '2025-01-01T00:00:00Z', to1: '2025-01-02T00:00:00Z',
      from2: '2026-01-01T00:00:00Z', to2: '2026-01-02T00:00:00Z',
    });
    expect(report).toEqual({
      period1: { loops: 0, cost: 0, successRate: 0 },
      period2: { loops: 0, cost: 0, successRate: 0 },
    });
  });

  it('rejects invalid day and date-range filters', async () => {
    database();
    await expect(getCostTrend(-1)).rejects.toThrow('days');
    await expect(getReportData({ from: 'bad', to: '2026-01-01' })).rejects.toThrow('ISO-8601');
    await expect(getReportData({ from: '2026-02-01', to: '2026-01-01' })).rejects.toThrow('after');
  });

  it('writes redacted exports atomically and preserves falsy metrics', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'dev-loop-export-')); dirs.push(dir);
    const file = path.join(dir, 'reports', 'loops.json');
    const result = await writeAnalyticsExport(file, [{ success: false, cost: 0, token: 'secret' }], 'json');
    expect(result).toMatchObject({ format: 'json', rowCount: 1 });
    expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual([{ success: false, cost: 0 }]);
    expect(readdirSync(path.dirname(file))).toEqual(['loops.json']);
  });

  it('rejects mismatched output formats', async () => {
    await expect(writeAnalyticsExport('/tmp/report.csv', [], 'json')).rejects.toThrow('.json');
  });
});
