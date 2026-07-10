import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createTestRunner,
  parseTestProcessResult,
  runTests,
} from '../runtime/test-runner.js';
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

describe('FEATURE061 - test runner abstraction', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('Test command success', async () => {
    const spawn = createSpawn({ stdout: '2 passed\n' });

    const result = await runTests({
      config: { type: 'command', command: 'vitest', args: ['run'], timeoutSeconds: 5 },
      projectDir: '/tmp/project',
      spawn,
    });

    expect(result).toMatchObject({
      runner: 'command',
      success: true,
      status: 'passed',
      command: 'vitest',
      args: ['run'],
      stdout: '2 passed\n',
      stderr: '',
    });
    expect(result.summary).toContain('2 passed');
    expect(spawn).toHaveBeenCalledWith('vitest', ['run'], expect.objectContaining({ cwd: '/tmp/project' }));
  });

  it('Test command failure captures output', async () => {
    const spawn = createSpawn({
      stdout: '1 failed, 1 passed\n',
      stderr: 'AssertionError: expected true to be false\n',
      exitCode: 1,
    });

    const result = await runTests({
      config: { type: 'command', command: 'pytest', args: ['-q'], timeoutSeconds: 5 },
      projectDir: '/tmp/project',
      spawn,
    });

    expect(result.success).toBe(false);
    expect(result.status).toBe('failed');
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain('1 failed');
    expect(result.stderr).toContain('AssertionError');
    expect(result.summary).toContain('1 failed');
  });

  it('Test timeout', async () => {
    vi.useFakeTimers();
    const spawn = createSpawn({ closeDelayMs: 1000 });

    const pending = runTests({
      config: { type: 'command', command: 'slow-tests', args: [], timeoutSeconds: 0.01 },
      projectDir: '/tmp/project',
      spawn,
    });

    await vi.advanceTimersByTimeAsync(10);

    await expect(pending).resolves.toMatchObject({
      runner: 'command',
      success: false,
      status: 'timed_out',
      exitCode: null,
    });
  });

  it('Test none runner success', async () => {
    const spawn = createSpawn({ stdout: 'should not run\n' });

    const result = await runTests({
      config: { type: 'none' },
      projectDir: '/tmp/project',
      spawn,
    });

    expect(result).toMatchObject({
      runner: 'none',
      success: true,
      status: 'skipped',
      stdout: '',
      stderr: '',
    });
    expect(spawn).not.toHaveBeenCalled();
  });

  it('returns a Docker compose placeholder without running Docker', async () => {
    const spawn = createSpawn({ stdout: 'should not run\n' });

    const result = await runTests({
      config: {
        type: 'docker',
        command: 'pytest',
        args: ['-q'],
        composeFile: 'compose.test.yml',
        service: 'app',
      },
      projectDir: '/tmp/project',
      spawn,
    });

    expect(result).toMatchObject({
      runner: 'docker',
      success: false,
      status: 'skipped',
      command: 'docker compose -f compose.test.yml run --rm app pytest',
      args: ['-q'],
    });
    expect(result.summary).toContain('not implemented');
    expect(spawn).not.toHaveBeenCalled();
  });

  it('uses the incremental test file support hook when changed files are provided', async () => {
    const spawn = createSpawn({ stdout: 'changed tests passed\n' });
    const runner = createTestRunner({
      incrementalArgs: changedFiles => ['--findRelatedTests', ...changedFiles],
    });

    const result = await runner.run({
      config: { type: 'command', command: 'vitest', args: ['run'], timeoutSeconds: 5 },
      projectDir: '/tmp/project',
      changedFiles: ['src/a.ts', 'src/b.ts'],
      spawn,
    });

    expect(result.args).toEqual(['run', '--findRelatedTests', 'src/a.ts', 'src/b.ts']);
    expect(spawn).toHaveBeenCalledWith(
      'vitest',
      ['run', '--findRelatedTests', 'src/a.ts', 'src/b.ts'],
      expect.any(Object),
    );
  });

  it('parses basic success and failure output without relying on a specific test framework', () => {
    expect(parseTestProcessResult({ exitCode: 0, stdout: 'ok\n', stderr: '' })).toMatchObject({
      success: true,
      status: 'passed',
      summary: 'ok',
    });
    expect(parseTestProcessResult({ exitCode: 2, stdout: '', stderr: 'tests failed hard\n' })).toMatchObject({
      success: false,
      status: 'failed',
      summary: 'tests failed hard',
    });
  });
});
