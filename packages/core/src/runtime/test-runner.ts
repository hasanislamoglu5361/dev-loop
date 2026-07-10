import { ProcessError, runProcess } from '../utils/process.js';
import type { SpawnLike } from '../utils/process.js';

export type TestRunnerType = 'command' | 'docker' | 'none';
export type TestRunStatus = 'passed' | 'failed' | 'timed_out' | 'skipped';

export interface TestRunnerConfig {
  type: TestRunnerType;
  command?: string;
  args?: string[];
  timeoutSeconds?: number;
  timeout_seconds?: number;
  composeFile?: string;
  compose_file?: string;
  service?: string;
}

export interface TestRunRequest {
  config: TestRunnerConfig;
  projectDir: string;
  changedFiles?: string[];
  env?: NodeJS.ProcessEnv;
  spawn?: SpawnLike;
}

export interface TestRunResult {
  runner: TestRunnerType;
  success: boolean;
  status: TestRunStatus;
  command?: string;
  args: string[];
  exitCode: number | null;
  stdout: string;
  stderr: string;
  summary: string;
  changedFiles: string[];
}

export interface TestOutputParseInput {
  exitCode: number | null;
  stdout: string;
  stderr: string;
}

export interface TestRunnerOptions {
  incrementalArgs?: (changedFiles: string[]) => string[];
}

export interface TestRunner {
  run(request: TestRunRequest): Promise<TestRunResult>;
}

export function createTestRunner(options: TestRunnerOptions = {}): TestRunner {
  return {
    run: request => runTests(request, options),
  };
}

export async function runTests(
  request: TestRunRequest,
  options: TestRunnerOptions = {},
): Promise<TestRunResult> {
  const changedFiles = request.changedFiles ?? [];

  if (request.config.type === 'none') {
    return {
      runner: 'none',
      success: true,
      status: 'skipped',
      args: [],
      exitCode: 0,
      stdout: '',
      stderr: '',
      summary: 'Test runner disabled.',
      changedFiles,
    };
  }

  if (request.config.type === 'docker') {
    return dockerPlaceholderResult(request.config, changedFiles);
  }

  const command = request.config.command;
  if (!command) {
    throw new Error('Test runner command is required when type is "command".');
  }

  const args = [
    ...(request.config.args ?? []),
    ...incrementalArgs(options, changedFiles),
  ];
  const timeoutSeconds = request.config.timeoutSeconds ?? request.config.timeout_seconds;

  try {
    const processResult = await runProcess(command, args, {
      cwd: request.projectDir,
      env: request.env,
      spawn: request.spawn,
      timeoutMs: timeoutSeconds === undefined ? undefined : timeoutSeconds * 1000,
    });
    const parsed = parseTestProcessResult(processResult);

    return {
      runner: 'command',
      command,
      args,
      exitCode: processResult.exitCode,
      stdout: processResult.stdout,
      stderr: processResult.stderr,
      changedFiles,
      ...parsed,
    };
  } catch (error) {
    if (error instanceof ProcessError) {
      const timedOut = timeoutSeconds !== undefined && error.exitCode === null;
      const parsed = parseTestProcessResult({
        exitCode: error.exitCode,
        stdout: error.stdout,
        stderr: error.stderr,
      });

      return {
        runner: 'command',
        success: false,
        status: timedOut ? 'timed_out' : parsed.status,
        command,
        args,
        exitCode: error.exitCode,
        stdout: error.stdout,
        stderr: error.stderr,
        summary: timedOut ? `Test command timed out after ${timeoutSeconds}s.` : parsed.summary,
        changedFiles,
      };
    }

    throw error;
  }
}

export function parseTestProcessResult(input: TestOutputParseInput): Pick<TestRunResult, 'success' | 'status' | 'summary'> {
  const output = [input.stdout, input.stderr]
    .map(value => value.trim())
    .filter(Boolean)
    .join('\n');
  const summary = firstUsefulLine(output) ?? (input.exitCode === 0 ? 'Tests passed.' : 'Tests failed.');

  return {
    success: input.exitCode === 0,
    status: input.exitCode === 0 ? 'passed' : 'failed',
    summary,
  };
}

function dockerPlaceholderResult(config: TestRunnerConfig, changedFiles: string[]): TestRunResult {
  const command = dockerCommandPreview(config);

  return {
    runner: 'docker',
    success: false,
    status: 'skipped',
    command,
    args: config.args ?? [],
    exitCode: null,
    stdout: '',
    stderr: '',
    summary: 'Docker compose test runner is configured but not implemented yet.',
    changedFiles,
  };
}

function dockerCommandPreview(config: TestRunnerConfig): string {
  const composeFile = config.composeFile ?? config.compose_file;
  const command = config.command ?? '';
  const parts = ['docker', 'compose'];

  if (composeFile) {
    parts.push('-f', composeFile);
  }

  parts.push('run', '--rm');

  if (config.service) {
    parts.push(config.service);
  }

  if (command) {
    parts.push(command);
  }

  return parts.join(' ');
}

function incrementalArgs(options: TestRunnerOptions, changedFiles: string[]): string[] {
  if (changedFiles.length === 0) {
    return [];
  }

  return options.incrementalArgs?.(changedFiles) ?? [];
}

function firstUsefulLine(output: string): string | undefined {
  return output
    .split(/\r?\n/)
    .map(line => line.trim())
    .find(Boolean);
}
