import { execFileSync, type ExecFileSyncOptions } from 'node:child_process';
import { repoRoot } from './repo-paths.js';

export interface CommandResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export function runCommand(command: string, args: string[], options: ExecFileSyncOptions = {}): string {
  return execFileSync(command, args, {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    ...options,
  }) as string;
}

export function runNpmScript(script: string, args: string[] = []): string {
  return runCommand('npm', ['run', script, ...args]);
}

export function expectCommandToFail(
  command: string,
  args: string[],
  options: ExecFileSyncOptions = {},
): CommandResult {
  try {
    runCommand(command, args, options);
  } catch (error) {
    const err = error as { stdout?: Buffer | string; stderr?: Buffer | string; status?: number };
    return {
      stdout: String(err.stdout ?? ''),
      stderr: String(err.stderr ?? ''),
      exitCode: err.status ?? 1,
    };
  }

  throw new Error(`Expected command to fail: ${command} ${args.join(' ')}`);
}
