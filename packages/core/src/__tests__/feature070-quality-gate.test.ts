import { describe, expect, it, vi } from 'vitest';
import { runQualityGate } from '../runtime/quality-checks.js';
import type { QualityCheckResult } from '../runtime/quality-checks.js';

function passed(kind: QualityCheckResult['kind'], metrics: Partial<QualityCheckResult> = {}): QualityCheckResult {
  return {
    kind,
    enabled: true,
    success: true,
    status: 'passed',
    args: [],
    exitCode: 0,
    stdout: '',
    stderr: '',
    summary: `${kind} passed`,
    ...metrics,
  };
}

function failed(kind: QualityCheckResult['kind'], summary: string): QualityCheckResult {
  return {
    kind,
    enabled: true,
    success: false,
    status: 'failed',
    args: [],
    exitCode: 1,
    stdout: summary,
    stderr: '',
    summary,
    actionableError: `Fix ${kind}`,
  };
}

describe('FEATURE070 - Quality Gate Orchestrator', () => {
  it('Test all-pass', async () => {
    const saveTrend = vi.fn();
    const notify = vi.fn();

    const result = await runQualityGate({
      projectDir: '/tmp/project',
      checks: [
        { kind: 'secrets', enabled: true },
        { kind: 'coverage', enabled: true },
        { kind: 'lint', enabled: true },
      ],
      checkers: {
        secrets: vi.fn(async () => passed('secrets', { metrics: { secretsFound: 0 } })),
        coverage: vi.fn(async () => passed('coverage', { coverage: { lines: 92 } })),
        lint: vi.fn(async () => passed('lint', { metrics: { lintErrors: 0 } })),
      },
      thresholds: { coverage: 80 },
      saveTrend,
      notify,
    });

    expect(result).toMatchObject({
      success: true,
      blockCommit: false,
      qualityScore: 100,
      failures: [],
      metrics: {
        secretsFound: 0,
        testCoveragePct: 92,
        lintErrors: 0,
      },
    });
    expect(saveTrend).toHaveBeenCalledOnce();
    expect(saveTrend).toHaveBeenCalledWith(expect.objectContaining({
      gatePassed: true,
      qualityScore: 100,
      testCoveragePct: 92,
    }));
    expect(notify).not.toHaveBeenCalled();
  });

  it('Test secrets fail', async () => {
    const notify = vi.fn();

    const result = await runQualityGate({
      projectDir: '/tmp/project',
      checks: [{ kind: 'secrets', enabled: true }],
      checkers: {
        secrets: vi.fn(async () => failed('secrets', '2 secrets found')),
      },
      notify,
    });

    expect(result.success).toBe(false);
    expect(result.blockCommit).toBe(true);
    expect(result.failures).toEqual([
      expect.objectContaining({
        kind: 'secrets',
        reason: '2 secrets found',
        actionableError: 'Fix secrets',
      }),
    ]);
    expect(result.qualityScore).toBeLessThan(100);
    expect(notify).toHaveBeenCalledOnce();
    expect(notify).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'quality_gate_failed',
      failures: result.failures,
    }));
  });

  it('Test coverage below threshold', async () => {
    const result = await runQualityGate({
      projectDir: '/tmp/project',
      checks: [{ kind: 'coverage', enabled: true }],
      checkers: {
        coverage: vi.fn(async () => passed('coverage', { coverage: { lines: 72.5 } })),
      },
      thresholds: { coverage: 80 },
    });

    expect(result.success).toBe(false);
    expect(result.blockCommit).toBe(true);
    expect(result.metrics.testCoveragePct).toBe(72.5);
    expect(result.failures).toEqual([
      expect.objectContaining({
        kind: 'coverage',
        reason: 'Coverage 72.5% is below required 80%.',
      }),
    ]);
  });

  it('Test disabled checks skipped', async () => {
    const secrets = vi.fn(async () => failed('secrets', 'should not run'));

    const result = await runQualityGate({
      projectDir: '/tmp/project',
      checks: [
        { kind: 'secrets', enabled: false },
        { kind: 'lint', enabled: true },
      ],
      checkers: {
        secrets,
        lint: vi.fn(async () => passed('lint')),
      },
    });

    expect(result.success).toBe(true);
    expect(result.results).toEqual([
      expect.objectContaining({ kind: 'secrets', status: 'skipped', success: true }),
      expect.objectContaining({ kind: 'lint', status: 'passed', success: true }),
    ]);
    expect(secrets).not.toHaveBeenCalled();
  });

  it('records uncertain tags as blocking failures when enabled', async () => {
    const result = await runQualityGate({
      projectDir: '/tmp/project',
      checks: [{ kind: 'uncertain', enabled: true }],
      checkers: {
        uncertain: vi.fn(async () => passed('uncertain', { metrics: { uncertainTags: 3 } })),
      },
    });

    expect(result.success).toBe(false);
    expect(result.failures).toEqual([
      expect.objectContaining({
        kind: 'uncertain',
        reason: '3 uncertain tag(s) remain.',
      }),
    ]);
  });

  it('blocks complexity strictly above the configured maximum', async () => {
    const atBoundary = await runQualityGate({
      projectDir: '/tmp/project', checks: [{ kind: 'complexity' }],
      checkers: { complexity: vi.fn(async () => passed('complexity', { metrics: { complexityScore: 10 } })) },
      thresholds: { complexityMax: 10 },
    });
    expect(atBoundary.success).toBe(true);

    const above = await runQualityGate({
      projectDir: '/tmp/project', checks: [{ kind: 'complexity' }],
      checkers: { complexity: vi.fn(async () => passed('complexity', { metrics: { complexityScore: 11 } })) },
      thresholds: { complexityMax: 10 },
    });
    expect(above.failures).toEqual([expect.objectContaining({ kind: 'complexity', reason: 'Complexity 11 exceeds maximum 10.' })]);
  });
});
