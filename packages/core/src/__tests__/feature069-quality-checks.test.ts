import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  parseCoverageOutput,
  parseVulnerabilityOutput,
  runQualityCheck,
  runQualityGate,
} from '../runtime/quality-checks.js';
import type { QualityCheckConfig } from '../runtime/quality-checks.js';
import type { SpawnLike } from '../utils/process.js';

class FakeChildProcess extends EventEmitter {
  stdout = new PassThrough();
  stderr = new PassThrough();
  kill = vi.fn(() => {
    this.emit('close', null, 'SIGTERM');
    return true;
  });
}

function createSpawn(result: {
  stdout?: string;
  stderr?: string;
  exitCode?: number;
  closeDelayMs?: number;
}): SpawnLike {
  return vi.fn(() => {
    const child = new FakeChildProcess();

    const close = () => {
      if (result.stdout) child.stdout.write(result.stdout);
      if (result.stderr) child.stderr.write(result.stderr);
      child.stdout.end();
      child.stderr.end();
      child.emit('close', result.exitCode ?? 0);
    };

    if (result.closeDelayMs === undefined) {
      queueMicrotask(close);
    } else {
      setTimeout(close, result.closeDelayMs);
    }

    return child;
  });
}

describe('FEATURE069 - vulnerability, lint, coverage, type coverage checks', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('Test command success/failure', async () => {
    const successSpawn = createSpawn({ stdout: 'found 0 vulnerabilities\n' });
    const success = await runQualityCheck({
      check: { kind: 'vulnerability', enabled: true, command: 'pnpm', args: ['audit', '--json'] },
      projectDir: '/tmp/project',
      spawn: successSpawn,
    });

    expect(success).toMatchObject({
      kind: 'vulnerability',
      enabled: true,
      success: true,
      status: 'passed',
      command: 'pnpm',
      args: ['audit', '--json'],
    });
    expect(successSpawn).toHaveBeenCalledWith('pnpm', ['audit', '--json'], expect.objectContaining({ cwd: '/tmp/project' }));

    const failureSpawn = createSpawn({
      stdout: 'ESLint found 2 problems\n',
      stderr: 'no-console\n',
      exitCode: 1,
    });
    const failure = await runQualityCheck({
      check: { kind: 'lint', enabled: true, command: 'npm', args: ['run', 'lint'] },
      projectDir: '/tmp/project',
      spawn: failureSpawn,
    });

    expect(failure).toMatchObject({
      kind: 'lint',
      success: false,
      status: 'failed',
      exitCode: 1,
    });
    expect(failure.summary).toContain('ESLint found 2 problems');
    expect(failure.actionableError).toContain('Fix lint issues');
  });

  it('Test parsing representative outputs', () => {
    expect(parseVulnerabilityOutput(JSON.stringify({
      metadata: {
        vulnerabilities: {
          info: 1,
          low: 2,
          moderate: 3,
          high: 4,
          critical: 5,
          total: 15,
        },
      },
    }))).toEqual({
      total: 15,
      info: 1,
      low: 2,
      moderate: 3,
      high: 4,
      critical: 5,
    });

    expect(parseCoverageOutput(`
      Statements   : 83.33% ( 25/30 )
      Branches     : 75% ( 9/12 )
      Functions    : 90% ( 9/10 )
      Lines        : 84.61% ( 22/26 )
    `)).toEqual({
      statements: 83.33,
      branches: 75,
      functions: 90,
      lines: 84.61,
    });
  });

  it('does not fail disabled checks or run subprocesses for them', async () => {
    const spawn = createSpawn({ stdout: 'should not run\n' });

    const result = await runQualityCheck({
      check: { kind: 'typecheck', enabled: false, command: 'npm', args: ['run', 'typecheck'] },
      projectDir: '/tmp/project',
      spawn,
    });

    expect(result).toMatchObject({
      kind: 'typecheck',
      enabled: false,
      success: true,
      status: 'skipped',
      exitCode: 0,
    });
    expect(spawn).not.toHaveBeenCalled();
  });

  it('runs vulnerability, coverage, lint, and typecheck checks uniformly', async () => {
    const configs: QualityCheckConfig[] = [
      { kind: 'vulnerability', enabled: true, command: 'npm', args: ['audit', '--json'] },
      { kind: 'coverage', enabled: true, command: 'npm', args: ['run', 'coverage'] },
      { kind: 'lint', enabled: true, command: 'npm', args: ['run', 'lint'] },
      { kind: 'typecheck', enabled: true, command: 'npm', args: ['run', 'typecheck'] },
    ];
    const spawn = createSpawn({ stdout: 'ok\n' });

    const gate = await runQualityGate({
      checks: configs,
      projectDir: '/tmp/project',
      spawn,
    });

    expect(gate.success).toBe(true);
    expect(gate.results.map(result => result.kind)).toEqual([
      'vulnerability',
      'coverage',
      'lint',
      'typecheck',
    ]);
    expect(spawn).toHaveBeenCalledTimes(4);
  });

  it('returns timeout results with actionable errors', async () => {
    vi.useFakeTimers();
    const spawn = createSpawn({ closeDelayMs: 1000 });

    const pending = runQualityCheck({
      check: { kind: 'coverage', enabled: true, command: 'npm', args: ['run', 'coverage'], timeoutSeconds: 0.01 },
      projectDir: '/tmp/project',
      spawn,
    });

    await vi.advanceTimersByTimeAsync(10);

    await expect(pending).resolves.toMatchObject({
      kind: 'coverage',
      success: false,
      status: 'timed_out',
      exitCode: null,
      actionableError: 'coverage check timed out after 0.01s. Increase timeoutSeconds or optimize the command.',
    });
  });
});
