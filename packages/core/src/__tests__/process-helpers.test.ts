import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ProcessError,
  retryWithBackoff,
  runProcess,
  withTimeout,
} from '../utils/process.js';
import type { SpawnLike } from '../utils/process.js';

class FakeChildProcess extends EventEmitter {
  stdout = new PassThrough();
  stderr = new PassThrough();
  kill = vi.fn();
}

function createSpawn(result: {
  stdout?: string;
  stderr?: string;
  exitCode?: number;
}): SpawnLike {
  return vi.fn(() => {
    const child = new FakeChildProcess();

    queueMicrotask(() => {
      if (result.stdout) child.stdout.write(result.stdout);
      if (result.stderr) child.stderr.write(result.stderr);
      child.stdout.end();
      child.stderr.end();
      child.emit('close', result.exitCode ?? 0);
    });

    return child;
  });
}

describe('FEATURE035 - process timeout and retry helpers', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('rejects when a promise exceeds the timeout', async () => {
    vi.useFakeTimers();

    const pending = new Promise<string>(() => undefined);
    const result = withTimeout(pending, 50, { message: 'provider call timed out' });
    const expectation = expect(result).rejects.toThrow('provider call timed out');

    await vi.advanceTimersByTimeAsync(50);

    await expectation;
  });

  it('retries with exponential backoff and stops after success', async () => {
    vi.useFakeTimers();
    const operation = vi
      .fn<[], Promise<string>>()
      .mockRejectedValueOnce(new Error('first failure'))
      .mockRejectedValueOnce(new Error('second failure'))
      .mockResolvedValueOnce('ok');
    const delays: number[] = [];

    const result = retryWithBackoff(operation, {
      retries: 2,
      baseDelayMs: 100,
      factor: 2,
      onRetry: info => delays.push(info.delayMs),
    });

    await vi.advanceTimersByTimeAsync(100);
    await vi.advanceTimersByTimeAsync(200);

    await expect(result).resolves.toBe('ok');
    expect(operation).toHaveBeenCalledTimes(3);
    expect(delays).toEqual([100, 200]);
  });

  it('runs subprocesses with injected spawn and captures stdout', async () => {
    const spawn = createSpawn({ stdout: 'hello\n' });

    const result = await runProcess('tool', ['--version'], { spawn });

    expect(spawn).toHaveBeenCalledWith('tool', ['--version'], expect.any(Object));
    expect(result).toEqual({
      command: 'tool',
      args: ['--version'],
      exitCode: 0,
      stdout: 'hello\n',
      stderr: '',
    });
  });

  it('rejects failed subprocesses with stderr on the error', async () => {
    const spawn = createSpawn({ stderr: 'bad flag\n', exitCode: 2 });

    await expect(runProcess('tool', ['--bad'], { spawn })).rejects.toMatchObject({
      name: 'ProcessError',
      exitCode: 2,
      stderr: 'bad flag\n',
    });
  });

  it('kills a running subprocess when the signal is aborted', async () => {
    const child = new FakeChildProcess();
    const spawn = vi.fn(() => child);
    const controller = new AbortController();

    const result = runProcess('tool', [], {
      spawn,
      signal: controller.signal,
    });

    controller.abort();
    child.emit('close', null, 'SIGTERM');

    await expect(result).rejects.toBeInstanceOf(ProcessError);
    expect(child.kill).toHaveBeenCalledWith('SIGTERM');
  });
});
