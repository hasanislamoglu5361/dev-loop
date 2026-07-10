import { DevLoopError } from '../../errors.js';
import { ProcessError, runProcess, type ProcessResult, type SpawnLike } from '../../utils/process.js';

export interface CliVerifierRunOptions {
  command: 'claude' | 'codex' | string;
  promptFile: string;
  args?: string[];
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  timeoutMs?: number;
  allowUnsafeFlags?: boolean;
  spawn?: SpawnLike;
}

export class VerifierCliError extends DevLoopError {
  readonly stdout: string;
  readonly stderr: string;
  readonly exitCode: number | null;

  constructor(
    message: string,
    code: 'verifier.cli_failed' | 'verifier.cli_timeout' | 'verifier.cli_missing' | 'verifier.unsafe_flags',
    action: string,
    details: { stdout?: string; stderr?: string; exitCode?: number | null; command?: string; args?: string[] },
    cause?: Error,
  ) {
    super(message, code, action, details, cause);
    this.name = 'VerifierCliError';
    this.stdout = details.stdout ?? '';
    this.stderr = details.stderr ?? '';
    this.exitCode = details.exitCode ?? null;
  }
}

const UNSAFE_FLAGS = new Set([
  '--dangerously-skip-permissions',
  '--allow-all',
  '--no-sandbox',
  '--unsafe',
]);

export async function runCliVerifier(options: CliVerifierRunOptions): Promise<ProcessResult> {
  const args = [...(options.args ?? []), '--prompt-file', options.promptFile];
  assertSafeArgs(args, options);

  try {
    return await runProcess(options.command, args, {
      cwd: options.cwd,
      env: options.env,
      timeoutMs: options.timeoutMs,
      spawn: options.spawn,
    });
  } catch (error) {
    throw toCliError(error, options.command, args, options.timeoutMs);
  }
}

function assertSafeArgs(args: string[], options: CliVerifierRunOptions): void {
  if (options.allowUnsafeFlags) return;

  const unsafe = args.find(arg => UNSAFE_FLAGS.has(arg));
  if (unsafe) {
    throw new VerifierCliError(
      `Unsafe verifier CLI flag is disabled: ${unsafe}`,
      'verifier.unsafe_flags',
      'Remove the unsafe flag or set allowUnsafeFlags only for an explicitly approved verifier configuration.',
      { command: options.command, args },
    );
  }
}

function toCliError(error: unknown, command: string, args: string[], timeoutMs?: number): VerifierCliError {
  if (isMissingBinary(error)) {
    return new VerifierCliError(
      `Verifier CLI binary not found: ${command}`,
      'verifier.cli_missing',
      `Install ${command} or configure the verifier command path.`,
      { command, args },
      error instanceof Error ? error : undefined,
    );
  }

  if (error instanceof ProcessError) {
    const timeout = timeoutMs !== undefined && error.exitCode === null;
    return new VerifierCliError(
      timeout
        ? `Verifier CLI timed out after ${timeoutMs}ms: ${command}`
        : `Verifier CLI failed with exit code ${error.exitCode ?? 'unknown'}: ${command}`,
      timeout ? 'verifier.cli_timeout' : 'verifier.cli_failed',
      timeout
        ? 'Increase verifier timeout or reduce the prompt size.'
        : 'Inspect stderr/stdout and fix the verifier command or prompt.',
      {
        command,
        args,
        stdout: error.stdout,
        stderr: error.stderr,
        exitCode: error.exitCode,
      },
      error,
    );
  }

  const cause = error instanceof Error ? error : new Error(String(error));
  return new VerifierCliError(
    `Verifier CLI failed: ${cause.message}`,
    'verifier.cli_failed',
    'Inspect the verifier command configuration and retry.',
    { command, args },
    cause,
  );
}

function isMissingBinary(error: unknown): boolean {
  return Boolean(
    error &&
      typeof error === 'object' &&
      ((error as NodeJS.ErrnoException).code === 'ENOENT' || /ENOENT|not found/i.test(String((error as Error).message))),
  );
}
