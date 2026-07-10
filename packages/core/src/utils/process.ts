import { createRequire } from 'node:module';
import type { EventEmitter } from 'node:events';
import type { Readable } from 'node:stream';

const require = createRequire(import.meta.url);

export interface TimeoutOptions {
  message?: string;
  signal?: AbortSignal;
}

export interface RetryInfo {
  attempt: number;
  delayMs: number;
  error: unknown;
}

export interface RetryOptions {
  retries: number;
  baseDelayMs: number;
  factor?: number;
  maxDelayMs?: number;
  signal?: AbortSignal;
  shouldRetry?: (error: unknown, attempt: number) => boolean;
  onRetry?: (info: RetryInfo) => void;
}

export interface ProcessResult {
  command: string;
  args: string[];
  exitCode: number;
  stdout: string;
  stderr: string;
}

export interface ProcessRunOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  signal?: AbortSignal;
  timeoutMs?: number;
  maxOutputBytes?: number;
  spawn?: SpawnLike;
}

export interface ChildProcessLike extends EventEmitter {
  stdout?: Readable | null;
  stderr?: Readable | null;
  kill(signal?: NodeJS.Signals | number): boolean | void;
}

export type SpawnLike = (
  command: string,
  args: string[],
  options: {
    cwd?: string;
    env?: NodeJS.ProcessEnv;
    stdio: ['ignore', 'pipe', 'pipe'];
  },
) => ChildProcessLike;

interface CrossSpawnModule {
  default?: SpawnLike;
  spawn?: SpawnLike;
}

const crossSpawn = require('cross-spawn') as SpawnLike & CrossSpawnModule;
const defaultSpawn = crossSpawn.default ?? crossSpawn.spawn ?? crossSpawn;
const DEFAULT_MAX_OUTPUT_BYTES = 1024 * 1024;

export class ProcessError extends Error {
  readonly command: string;
  readonly args: string[];
  readonly exitCode: number | null;
  readonly stdout: string;
  readonly stderr: string;
  readonly signal?: NodeJS.Signals | string;

  constructor(message: string, result: Omit<ProcessResult, 'exitCode'> & {
    exitCode: number | null;
    signal?: NodeJS.Signals | string;
  }) {
    super(message);
    this.name = 'ProcessError';
    Object.setPrototypeOf(this, new.target.prototype);
    this.command = result.command;
    this.args = result.args;
    this.exitCode = result.exitCode;
    this.stdout = result.stdout;
    this.stderr = result.stderr;
    this.signal = result.signal;
  }
}

/** Reject a promise if it does not settle before the timeout or abort signal. */
export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  options: TimeoutOptions = {},
): Promise<T> {
  if (timeoutMs < 0) {
    throw new Error('timeoutMs must be non-negative.');
  }

  if (options.signal?.aborted) {
    throw new Error('Operation was cancelled.');
  }

  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error(options.message ?? `Operation timed out after ${timeoutMs}ms.`));
    }, timeoutMs);

    const onAbort = () => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error('Operation was cancelled.'));
    };

    const cleanup = () => {
      clearTimeout(timeout);
      options.signal?.removeEventListener('abort', onAbort);
    };

    options.signal?.addEventListener('abort', onAbort, { once: true });

    promise.then(
      value => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve(value);
      },
      error => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(error);
      },
    );
  });
}

/** Retry an async operation with deterministic exponential backoff delays. */
export async function retryWithBackoff<T>(
  operation: () => Promise<T>,
  options: RetryOptions,
): Promise<T> {
  if (options.retries < 0) {
    throw new Error('retries must be non-negative.');
  }
  if (options.baseDelayMs < 0) {
    throw new Error('baseDelayMs must be non-negative.');
  }

  const factor = options.factor ?? 2;

  for (let attempt = 1; ; attempt += 1) {
    throwIfAborted(options.signal);

    try {
      return await operation();
    } catch (error) {
      const canRetry =
        attempt <= options.retries &&
        (options.shouldRetry ? options.shouldRetry(error, attempt) : true);

      if (!canRetry) {
        throw error;
      }

      const delayMs = Math.min(
        options.baseDelayMs * factor ** (attempt - 1),
        options.maxDelayMs ?? Number.POSITIVE_INFINITY,
      );
      options.onRetry?.({ attempt, delayMs, error });
      await delay(delayMs, options.signal);
    }
  }
}

/** Run a subprocess through cross-spawn and return bounded stdout/stderr output. */
export async function runProcess(
  command: string,
  args: string[] = [],
  options: ProcessRunOptions = {},
): Promise<ProcessResult> {
  const spawn = options.spawn ?? defaultSpawn;
  const maxOutputBytes = options.maxOutputBytes ?? DEFAULT_MAX_OUTPUT_BYTES;
  const child = spawn(command, args, {
    cwd: options.cwd,
    env: options.env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let stdout = '';
  let stderr = '';
  let settled = false;

  const timeout = options.timeoutMs === undefined
    ? undefined
    : setTimeout(() => {
        child.kill('SIGTERM');
      }, options.timeoutMs);

  const onAbort = () => {
    child.kill('SIGTERM');
  };

  options.signal?.addEventListener('abort', onAbort, { once: true });

  child.stdout?.on('data', chunk => {
    stdout = appendOutput(stdout, chunk, maxOutputBytes);
  });
  child.stderr?.on('data', chunk => {
    stderr = appendOutput(stderr, chunk, maxOutputBytes);
  });

  return new Promise<ProcessResult>((resolve, reject) => {
    const cleanup = () => {
      if (timeout) clearTimeout(timeout);
      options.signal?.removeEventListener('abort', onAbort);
    };

    child.once('error', error => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error);
    });

    child.once('close', (exitCode: number | null, signal?: NodeJS.Signals | string) => {
      if (settled) return;
      settled = true;
      cleanup();

      if (options.signal?.aborted) {
        reject(new ProcessError(
          `Process cancelled: ${formatCommand(command, args)}`,
          { command, args, exitCode, stdout, stderr, signal: signal ?? 'SIGTERM' },
        ));
        return;
      }

      if (exitCode === 0) {
        resolve({ command, args, exitCode, stdout, stderr });
        return;
      }

      reject(new ProcessError(
        `Process failed with exit code ${exitCode ?? 'unknown'}: ${formatCommand(command, args)}`,
        { command, args, exitCode, stdout, stderr, signal },
      ));
    });
  });
}

function delay(ms: number, signal?: AbortSignal): Promise<void> {
  if (ms === 0) {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup();
      resolve();
    }, ms);

    const onAbort = () => {
      cleanup();
      reject(new Error('Operation was cancelled.'));
    };

    const cleanup = () => {
      clearTimeout(timeout);
      signal?.removeEventListener('abort', onAbort);
    };

    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new Error('Operation was cancelled.');
  }
}

function appendOutput(current: string, chunk: unknown, maxBytes: number): string {
  const next = current + Buffer.from(chunk as Buffer).toString('utf8');
  if (Buffer.byteLength(next, 'utf8') <= maxBytes) {
    return next;
  }

  return next.slice(0, maxBytes) + '\n[output truncated]\n';
}

function formatCommand(command: string, args: string[]): string {
  return [command, ...args].join(' ');
}
