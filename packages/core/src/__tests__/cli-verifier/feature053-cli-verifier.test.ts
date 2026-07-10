import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { VerifierCliError, runCliVerifier } from '../../models/verifier/cli-runner.js';
import type { ChildProcessLike, SpawnLike } from '../../utils/process.js';

function mockProcess(options: {
  stdout?: string;
  stderr?: string;
  exitCode?: number | null;
  error?: NodeJS.ErrnoException;
  closeDelayMs?: number;
}): ChildProcessLike {
  const child = new EventEmitter() as ChildProcessLike;
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  child.kill = () => {
    setTimeout(() => child.emit('close', null, 'SIGTERM'), 0);
    return true;
  };

  setTimeout(() => {
    if (options.error) {
      child.emit('error', options.error);
      return;
    }
    child.stdout?.emit('data', Buffer.from(options.stdout ?? ''));
    child.stderr?.emit('data', Buffer.from(options.stderr ?? ''));
    setTimeout(() => child.emit('close', options.exitCode ?? 0), options.closeDelayMs ?? 0);
  }, 0);

  return child;
}

describe('FEATURE053 - CLI Verifier Runner', () => {
  it('runs a CLI verifier with a prompt file and captures stdout/stderr', async () => {
    const calls: Array<{ command: string; args: string[] }> = [];
    const spawn: SpawnLike = (command, args) => {
      calls.push({ command, args });
      return mockProcess({ stdout: '{"ok":true}', stderr: 'note', exitCode: 0 });
    };

    await expect(runCliVerifier({
      command: 'codex',
      promptFile: '/tmp/prompt.md',
      args: ['--model', 'gpt-5'],
      spawn,
    })).resolves.toEqual({
      command: 'codex',
      args: ['--model', 'gpt-5', '--prompt-file', '/tmp/prompt.md'],
      exitCode: 0,
      stdout: '{"ok":true}',
      stderr: 'note',
    });
    expect(calls[0]).toEqual({
      command: 'codex',
      args: ['--model', 'gpt-5', '--prompt-file', '/tmp/prompt.md'],
    });
  });

  it('returns an actionable error for non-zero exits with captured output', async () => {
    const spawn: SpawnLike = () => mockProcess({ stdout: 'partial', stderr: 'bad', exitCode: 2 });

    await expect(runCliVerifier({ command: 'claude', promptFile: '/tmp/prompt.md', spawn })).rejects.toMatchObject({
      name: 'VerifierCliError',
      code: 'verifier.cli_failed',
      stdout: 'partial',
      stderr: 'bad',
    });
  });

  it('times out and kills a hanging verifier process', async () => {
    const spawn: SpawnLike = () => mockProcess({ closeDelayMs: 1000 });

    await expect(runCliVerifier({
      command: 'codex',
      promptFile: '/tmp/prompt.md',
      timeoutMs: 1,
      spawn,
    })).rejects.toMatchObject({
      code: 'verifier.cli_timeout',
    });
  });

  it('returns an actionable CLI-not-found error for missing binaries', async () => {
    const error = Object.assign(new Error('spawn codex ENOENT'), { code: 'ENOENT' });
    const spawn: SpawnLike = () => mockProcess({ error });

    await expect(runCliVerifier({ command: 'codex', promptFile: '/tmp/prompt.md', spawn })).rejects.toMatchObject({
      code: 'verifier.cli_missing',
      action: expect.stringContaining('Install'),
    });
    await expect(runCliVerifier({ command: 'codex', promptFile: '/tmp/prompt.md', spawn })).rejects.toBeInstanceOf(VerifierCliError);
  });

  it('rejects unsafe flags unless explicitly allowed', async () => {
    const spawn: SpawnLike = () => mockProcess({ stdout: 'should not run' });

    await expect(runCliVerifier({
      command: 'codex',
      promptFile: '/tmp/prompt.md',
      args: ['--dangerously-skip-permissions'],
      spawn,
    })).rejects.toMatchObject({ code: 'verifier.unsafe_flags' });

    await expect(runCliVerifier({
      command: 'codex',
      promptFile: '/tmp/prompt.md',
      args: ['--dangerously-skip-permissions'],
      allowUnsafeFlags: true,
      spawn,
    })).resolves.toMatchObject({ stdout: 'should not run' });
  });
});
