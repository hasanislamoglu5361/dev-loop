import { watch as watchDirectory } from 'node:fs';
import type { FSWatcher } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Command } from 'commander';
import {
  checkConfigFile,
  buildProjectRuntimePaths,
  CheckpointManager,
  createDefaultConfig,
  createTestRunner,
  createVerifier,
  initProjectRuntime,
  loadConfig,
  mergeGitignore,
  mergeVSCodeSettings,
  runLoop,
  runProcess,
  runQualityGate,
  saveConfig,
} from '@dev-loop/core';
import type { TestRunResult } from '@dev-loop/core';
import { startUiServer as defaultStartUiServer } from '@dev-loop/ui';
import type { UiServerController, UiServerOptions } from '@dev-loop/ui';
import {
  checkIntegrity,
  createErrorPattern,
  getDbStats,
  getErrorPatterns,
  getMcpUsage,
  getRecentLoops,
  getUncertainTags,
  initDatabase,
  rawQuery,
  retireErrorPattern,
  updateErrorPattern,
  vacuum,
} from '@dev-loop/core/db';
import { generateCodeMap } from '@dev-loop/core';

export interface SetupAnswers {
  planningProvider?: string;
  planningModel?: string;
  testCommand?: string;
}

export interface SetupQuestion {
  name: keyof SetupAnswers;
  message: string;
  defaultValue: string;
}

export interface CliEnvironment {
  nodeVersion: string;
  supported: boolean;
}

export interface CliWorkflowRequest {
  featureId: string;
  projectDir: string;
  dryRun?: boolean;
  watch?: boolean;
  verifierOnly?: boolean;
}

export type CliWorkflow = (request: CliWorkflowRequest) => Promise<unknown>;

export interface CliWorkflows {
  run?: CliWorkflow;
  verify?: CliWorkflow;
  test?: CliWorkflow;
  quality?: CliWorkflow;
  resume?: CliWorkflow;
  replay?: CliWorkflow;
}

export interface WatchHandle {
  close(): void;
}

export type WatchFactory = (projectDir: string, onChange: () => void) => WatchHandle;

export type DataCommandAction =
  | 'patterns:list'
  | 'patterns:show'
  | 'patterns:update'
  | 'patterns:retire'
  | 'patterns:import'
  | 'patterns:export'
  | 'export'
  | 'voice'
  | 'codemap:update'
  | 'db:vacuum'
  | 'db:stats'
  | 'db:check';

export interface CliDataApi {
  logs?: (kind: 'history' | 'mcp' | 'uncertain', request: { projectDir: string }) => Promise<Array<Record<string, unknown>>>;
  query?: (sql: string, request: { projectDir: string }) => Promise<unknown>;
  command?: (action: DataCommandAction, request: Record<string, unknown>) => Promise<unknown>;
}

export type StartUiServer = (options: UiServerOptions) => Promise<UiServerController>;

export interface CreateCliOptions {
  nodeVersion?: string;
  prompt?: (questions: SetupQuestion[]) => Promise<SetupAnswers>;
  workflows?: CliWorkflows;
  watchFactory?: WatchFactory;
  watchDebounceMs?: number;
  dataApi?: CliDataApi;
  startUiServer?: StartUiServer;
}

const DEFAULT_SETUP_ANSWERS: Required<SetupAnswers> = {
  planningProvider: 'anthropic',
  planningModel: 'claude-sonnet-4-6',
  testCommand: 'npm test',
};

export function detectEnvironment(nodeVersion = process.version): CliEnvironment {
  const major = Number.parseInt(nodeVersion.replace(/^v/, '').split('.')[0] ?? '0', 10);
  return {
    nodeVersion,
    supported: Number.isFinite(major) && major >= 20,
  };
}

export function createCli(options: CreateCliOptions = {}): Command {
  const workflows = createWorkflows(options.workflows);
  const dataApi = createDataApi(options.dataApi);
  const watchFactory = options.watchFactory ?? defaultWatchFactory;
  const watchDebounceMs = options.watchDebounceMs ?? 250;
  const startUi = options.startUiServer ?? defaultStartUiServer;
  const program = new Command()
    .name('dev-loop')
    .description('AI-powered development loop automation')
    .version('0.1.0');

  program
    .command('init')
    .description('Initialize dev-loop files in a project')
    .option('-p, --project-dir <dir>', 'project directory to initialize', process.cwd())
    .action(async (commandOptions: { projectDir: string }) => {
      const env = detectEnvironment(options.nodeVersion);
      if (!env.supported) {
        throw new Error(`dev-loop requires Node.js 20 or newer. Current version: ${env.nodeVersion}`);
      }

      await createDefaultConfig(commandOptions.projectDir);
      initProjectRuntime(commandOptions.projectDir);
      mergeGitignore(commandOptions.projectDir);
      mergeVSCodeSettings(commandOptions.projectDir);
      console.log(`Initialized dev-loop in ${commandOptions.projectDir}`);
    });

  program
    .command('setup')
    .description('Run the dev-loop setup wizard')
    .option('-p, --project-dir <dir>', 'project directory to configure', process.cwd())
    .action(async (commandOptions: { projectDir: string }) => {
      const env = detectEnvironment(options.nodeVersion);
      if (!env.supported) {
        throw new Error(`dev-loop requires Node.js 20 or newer. Current version: ${env.nodeVersion}`);
      }

      await createDefaultConfig(commandOptions.projectDir);
      initProjectRuntime(commandOptions.projectDir);
      mergeGitignore(commandOptions.projectDir);
      mergeVSCodeSettings(commandOptions.projectDir);

      const questions: SetupQuestion[] = [
        { name: 'planningProvider', message: 'Planning provider', defaultValue: DEFAULT_SETUP_ANSWERS.planningProvider },
        { name: 'planningModel', message: 'Planning model', defaultValue: DEFAULT_SETUP_ANSWERS.planningModel },
        { name: 'testCommand', message: 'Test command', defaultValue: DEFAULT_SETUP_ANSWERS.testCommand },
      ];
      const answers = {
        ...DEFAULT_SETUP_ANSWERS,
        ...(options.prompt ? await options.prompt(questions) : {}),
      };

      await saveConfig(commandOptions.projectDir, {
        'planning.primary.provider': answers.planningProvider,
        'planning.primary.model': answers.planningModel,
        'test_runner.command': answers.testCommand,
      });
      console.log(`Configured dev-loop in ${commandOptions.projectDir}`);
    });

  program
    .command('run [featureId]')
    .description('Run the dev-loop workflow for a feature')
    .option('-p, --project-dir <dir>', 'project directory', process.cwd())
    .option('--dry-run', 'show what would run without executing the loop')
    .action(async (featureId: string | undefined, commandOptions: { projectDir: string; dryRun?: boolean }) => {
      printWorkflowResult(await workflows.run({
        featureId: featureId ?? 'FEATURES',
        projectDir: commandOptions.projectDir,
        dryRun: Boolean(commandOptions.dryRun),
      }));
    });

  program
    .command('watch [featureId]')
    .description('Watch a project and run the dev-loop workflow after changes')
    .option('-p, --project-dir <dir>', 'project directory', process.cwd())
    .action((featureId: string | undefined, commandOptions: { projectDir: string }) => {
      const request: CliWorkflowRequest = {
        featureId: featureId ?? 'FEATURES',
        projectDir: commandOptions.projectDir,
        watch: true,
      };
      createWatchScheduler({
        projectDir: commandOptions.projectDir,
        debounceMs: watchDebounceMs,
        watchFactory,
        run: () => workflows.run(request),
      });
      console.log(`Watching ${commandOptions.projectDir}`);
    });

  program
    .command('verify [featureId]')
    .description('Run verifier-only checks for a feature')
    .option('-p, --project-dir <dir>', 'project directory', process.cwd())
    .action(async (featureId: string | undefined, commandOptions: { projectDir: string }) => {
      printWorkflowResult(await workflows.verify({
        featureId: featureId ?? 'FEATURES',
        projectDir: commandOptions.projectDir,
        verifierOnly: true,
      }));
    });

  program
    .command('test [featureId]')
    .description('Run configured project tests')
    .option('-p, --project-dir <dir>', 'project directory', process.cwd())
    .action(async (featureId: string | undefined, commandOptions: { projectDir: string }) => {
      printWorkflowResult(await workflows.test({ featureId: featureId ?? 'FEATURES', projectDir: commandOptions.projectDir }));
    });

  program
    .command('quality [featureId]')
    .description('Run quality gate checks')
    .option('-p, --project-dir <dir>', 'project directory', process.cwd())
    .action(async (featureId: string | undefined, commandOptions: { projectDir: string }) => {
      printWorkflowResult(await workflows.quality({ featureId: featureId ?? 'FEATURES', projectDir: commandOptions.projectDir }));
    });

  program
    .command('resume [featureId]')
    .description('Resume an interrupted dev-loop workflow')
    .option('-p, --project-dir <dir>', 'project directory', process.cwd())
    .action(async (featureId: string | undefined, commandOptions: { projectDir: string }) => {
      printWorkflowResult(await workflows.resume({ featureId: featureId ?? 'FEATURES', projectDir: commandOptions.projectDir }));
    });

  program
    .command('replay [featureId]')
    .description('Replay a previous dev-loop workflow')
    .option('-p, --project-dir <dir>', 'project directory', process.cwd())
    .action(async (featureId: string | undefined, commandOptions: { projectDir: string }) => {
      printWorkflowResult(await workflows.replay({ featureId: featureId ?? 'FEATURES', projectDir: commandOptions.projectDir }));
    });

  program
    .command('ui')
    .description('Start the dev-loop web UI backend')
    .option('-p, --project-dir <dir>', 'project directory', process.cwd())
    .option('--host <host>', 'host to bind', '127.0.0.1')
    .option('--port <port>', 'port to bind', '3747')
    .action(async (commandOptions: { projectDir: string; host: string; port: string }) => {
      const server = await startUi({
        host: commandOptions.host,
        port: Number(commandOptions.port),
        projectDir: commandOptions.projectDir,
      });
      console.log(`dev-loop UI backend listening on http://${server.address.host}:${server.address.port}`);
    });

  program
    .command('config')
    .description('Show or update dev-loop configuration')
    .addCommand(new Command('show')
      .description('Print dev-loop configuration with secrets redacted')
      .option('-p, --project-dir <dir>', 'project directory', process.cwd())
      .action(async (commandOptions: { projectDir: string }) => {
        const config = await loadConfig({ projectDir: commandOptions.projectDir, invalidConfig: 'warn-and-default' });
        console.log(redactedJson(config));
      }))
    .addCommand(new Command('set')
      .description('Set a dev-loop configuration value')
      .argument('[key]', 'dot-notation config key')
      .argument('[value]', 'value')
      .option('-p, --project-dir <dir>', 'project directory', process.cwd())
      .option('--path <path>', 'dot-notation config key')
      .option('--value <value>', 'value')
      .action(async (key: string | undefined, value: string | undefined, commandOptions: { projectDir: string; path?: string; value?: string }) => {
        const configKey = key ?? commandOptions.path;
        const configValue = value ?? commandOptions.value;
        if (!configKey || configValue === undefined) {
          throw new Error('config set requires a key/value or --path/--value.');
        }
        await setConfigValue(commandOptions.projectDir, configKey, configValue);
        console.log(`Updated ${configKey}`);
      }));

  const logsCommand = new Command('logs')
    .description('Query dev-loop logs')
    .option('-p, --project-dir <dir>', 'project directory', process.cwd())
    .action(async (commandOptions: { projectDir: string }) => {
      const rows = await dataApi.logs('history', { projectDir: commandOptions.projectDir });
      console.log(formatTable(rows));
    })
    .addCommand(createLogsCommand('history', dataApi))
    .addCommand(createLogsCommand('mcp', dataApi))
    .addCommand(createLogsCommand('uncertain', dataApi));
  program.addCommand(logsCommand);

  program
    .command('patterns')
    .description('Manage learned patterns')
    .addCommand(createDataCommand('list', 'patterns:list', dataApi))
    .addCommand(createDataCommand('show', 'patterns:show', dataApi, '<id>'))
    .addCommand(createDataCommand('update', 'patterns:update', dataApi, '<id>'))
    .addCommand(createDataCommand('retire', 'patterns:retire', dataApi, '<id>'))
    .addCommand(createDataCommand('import', 'patterns:import', dataApi, '<file>'))
    .addCommand(createDataCommand('export', 'patterns:export', dataApi, '[file]'));

  program
    .command('export [target]')
    .description('Export dev-loop data')
    .option('-p, --project-dir <dir>', 'project directory', process.cwd())
    .option('--output <file>', 'write JSON export to a file')
    .action(async (target: string | undefined, commandOptions: { projectDir: string; output?: string }) => {
      const config = await loadConfig({ projectDir: commandOptions.projectDir, invalidConfig: 'warn-and-default' });
      const result = await dataApi.command('export', { target, projectDir: commandOptions.projectDir, config });
      if (commandOptions.output) {
        await mkdir(path.dirname(commandOptions.output), { recursive: true });
        await writeFile(commandOptions.output, `${redactedJson(result)}\n`, 'utf-8');
        console.log(`Exported ${commandOptions.output}`);
        return;
      }
      console.log(formatCommandResult(result));
    });

  program
    .command('query [sql]')
    .description('Run a safe dev-loop data query')
    .option('-p, --project-dir <dir>', 'project directory', process.cwd())
    .option('--sql <sql>', 'SQL query')
    .action(async (sql: string | undefined, commandOptions: { projectDir: string; sql?: string }) => {
      const query = sql ?? commandOptions.sql;
      if (!query) {
        throw new Error('query requires SQL text.');
      }
      console.log(formatCommandResult(await dataApi.query(query, { projectDir: commandOptions.projectDir })));
    });

  program
    .command('voice [text]')
    .description('Process a voice command transcript')
    .option('-p, --project-dir <dir>', 'project directory', process.cwd())
    .action(async (text: string | undefined, commandOptions: { projectDir: string }) => {
      console.log(formatCommandResult(await dataApi.command('voice', { text, projectDir: commandOptions.projectDir })));
    });

  program
    .command('codemap')
    .description('Manage code map data')
    .addCommand(createDataCommand('update', 'codemap:update', dataApi));

  program
    .command('db')
    .description('Database maintenance commands')
    .addCommand(createDataCommand('vacuum', 'db:vacuum', dataApi))
    .addCommand(createDataCommand('stats', 'db:stats', dataApi))
    .addCommand(createDataCommand('check', 'db:check', dataApi));

  program
    .command('config-check')
    .description('Validate dev-loop.yaml and print actionable errors')
    .option('-p, --project-dir <dir>', 'project directory containing dev-loop.yaml', process.cwd())
    .action((options: { projectDir: string }) => {
      const result = checkConfigFile(options.projectDir);

      if (!result.success) {
        console.error(result.message);
        process.exitCode = 1;
        return;
      }

      console.log(`${result.configPath} is valid.`);
    });

  const parseAsync = program.parseAsync.bind(program);
  program.parseAsync = async (...args: Parameters<Command['parseAsync']>) => {
    await parseAsync(...args);
    return undefined as unknown as Command;
  };

  return program;
}

interface WatchSchedulerOptions {
  projectDir: string;
  debounceMs: number;
  watchFactory: WatchFactory;
  run: () => Promise<unknown>;
}

export function createWatchScheduler(options: WatchSchedulerOptions): WatchHandle {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let running = false;
  let rerunRequested = false;

  const schedule = (): void => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(async () => {
      if (running) {
        rerunRequested = true;
        return;
      }

      running = true;
      try {
        await options.run();
      } finally {
        running = false;
        if (rerunRequested) {
          rerunRequested = false;
          schedule();
        }
      }
    }, options.debounceMs);
  };

  const watcher = options.watchFactory(options.projectDir, schedule);
  return {
    close(): void {
      if (timer) clearTimeout(timer);
      watcher.close();
    },
  };
}

function defaultWatchFactory(projectDir: string, onChange: () => void): WatchHandle {
  const watcher: FSWatcher = watchDirectory(projectDir, { persistent: true }, () => onChange());
  return {
    close(): void {
      watcher.close();
    },
  };
}

function createWorkflows(overrides: CliWorkflows = {}): Required<CliWorkflows> {
  return {
    run: overrides.run ?? (async request => {
      if (request.dryRun) {
        return { dryRun: true, featureId: request.featureId, projectDir: request.projectDir };
      }
      return runLoop(request.featureId, { projectDir: request.projectDir });
    }),
    verify: overrides.verify ?? runConfiguredVerifier,
    test: overrides.test ?? (async request => runConfiguredTests(request.projectDir)),
    quality: overrides.quality ?? (async request => runConfiguredQuality(request.projectDir)),
    resume: overrides.resume ?? (async request => {
      const runtime = buildProjectRuntimePaths(request.projectDir);
      const checkpoint = await new CheckpointManager({ checkpointDir: runtime.dirs.checkpoints })
        .restoreLatest(request.featureId);
      if (!checkpoint) throw new Error(`No checkpoint found for loop ${request.featureId}.`);
      return { command: 'resume', resumed: true, checkpoint };
    }),
    replay: overrides.replay ?? (async request => runLoop(request.featureId, { projectDir: request.projectDir })),
  };
}

async function runConfiguredVerifier(request: CliWorkflowRequest): Promise<unknown> {
  const config = await loadConfig({ projectDir: request.projectDir });
  if (config.verifier.provider === 'api') {
    throw new Error('API verifier requires a programmatic model adapter; configure claude-cli, claude-code-cli, or codex-cli for the CLI command.');
  }
  const runtime = initProjectRuntime(request.projectDir);
  const promptFile = path.join(runtime.dirs.logs, `verify-${request.featureId}.md`);
  const options = { promptFile, bugsFile: runtime.files.BUGS };
  const verifier = createVerifier({
    kind: config.verifier.provider,
    options,
  });
  const [diffResult, filesResult, featurePrompt] = await Promise.all([
    runProcess('git', ['diff', '--no-ext-diff'], { cwd: request.projectDir }),
    runProcess('git', ['diff', '--name-only'], { cwd: request.projectDir }),
    readFile(runtime.files.FEATURES, 'utf8').catch(() => request.featureId),
  ]);
  const review = await verifier.review({
    featureId: request.featureId,
    prompt: featurePrompt,
    changedFiles: filesResult.stdout.split(/\r?\n/).filter(Boolean),
    commandsRun: [],
    metadata: { diff: diffResult.stdout },
    ...reviewMetadata(config.verifier.provider, diffResult.stdout),
  });
  return { command: 'verify', verified: review.status === 'pass', review };
}

function reviewMetadata(provider: string, diff: string): { diff?: string } {
  return provider.startsWith('claude') ? { diff } : {};
}

async function runConfiguredTests(projectDir: string): Promise<TestRunResult> {
  const config = await loadConfig({ projectDir });
  return createTestRunner().run({ config: config.test_runner, projectDir });
}

async function runConfiguredQuality(projectDir: string): Promise<unknown> {
  const config = await loadConfig({ projectDir });
  if (!config.quality_gate.enabled) {
    return { success: true, results: [], failures: [], metrics: {}, qualityScore: 100, blockCommit: false };
  }
  const checks = [];
  if (config.quality_gate.checks.lint) checks.push({ kind: 'lint' as const, command: 'npm', args: ['run', 'lint'] });
  checks.push({ kind: 'typecheck' as const, command: 'npm', args: ['run', 'typecheck'] });
  return runQualityGate({
    projectDir,
    checks,
    thresholds: {
      coverage: config.quality_gate.checks.test_coverage_min,
      typeCoverage: config.quality_gate.checks.type_coverage_min,
      mcpScore: config.quality_gate.checks.mcp_score_min,
    },
    blockCommitOnFailure: config.quality_gate.block_commit_on_failure,
  });
}

function createDataApi(overrides: CliDataApi = {}): Required<CliDataApi> {
  return {
    logs: overrides.logs ?? (async (kind, request) => {
      initializeProjectDatabase(request.projectDir);
      if (kind === 'history') return getRecentLoops();
      if (kind === 'mcp') return getMcpUsage();
      return getUncertainTags();
    }),
    query: overrides.query ?? (async (sql, request) => {
      initializeProjectDatabase(request.projectDir);
      return rawQuery(sql);
    }),
    command: overrides.command ?? runDataCommand,
  };
}

function initializeProjectDatabase(projectDir: string): void {
  const runtime = initProjectRuntime(projectDir);
  initDatabase(path.join(runtime.runtimeRoot, 'dev-loop.db'));
}

async function runDataCommand(action: DataCommandAction, request: Record<string, unknown>): Promise<unknown> {
  const projectDir = String(request.projectDir ?? process.cwd());
  initializeProjectDatabase(projectDir);
  const value = request.value === undefined ? undefined : String(request.value);

  switch (action) {
    case 'patterns:list': return getErrorPatterns();
    case 'patterns:show': return value ? rawQuery(`SELECT * FROM error_patterns WHERE id = ${parseNumericId(value)}`) : [];
    case 'patterns:update': {
      const id = parseNumericId(value);
      const rows = await rawQuery(`SELECT seen_count FROM error_patterns WHERE id = ${id}`);
      if (!rows[0]) throw new Error(`Pattern ${id} not found.`);
      await updateErrorPattern(id, { seenCount: Number(rows[0].seen_count ?? 0) + 1 });
      return { id, updated: true };
    }
    case 'patterns:retire': {
      const id = parseNumericId(value);
      await retireErrorPattern(id);
      return { id, retired: true };
    }
    case 'patterns:import': {
      if (!value) throw new Error('patterns import requires a JSON file.');
      const parsed = JSON.parse(await readFile(path.resolve(value), 'utf8')) as unknown;
      if (!Array.isArray(parsed)) throw new Error('Pattern import file must contain a JSON array.');
      const ids: number[] = [];
      for (const item of parsed) {
        if (!item || typeof item !== 'object') throw new Error('Each imported pattern must be an object.');
        const row = item as Record<string, unknown>;
        const created = await createErrorPattern({
          patternHash: String(row.patternHash ?? row.hash ?? `import-${Date.now()}-${ids.length}`),
          model: String(row.model ?? 'unknown'),
          featureKeywords: Array.isArray(row.featureKeywords) ? row.featureKeywords : [],
          errorDescription: String(row.errorDescription ?? 'Imported pattern'),
          fixDescription: String(row.fixDescription ?? ''),
        });
        ids.push(created.id);
      }
      return { imported: ids.length, ids };
    }
    case 'patterns:export': {
      const rows = await getErrorPatterns();
      if (value) await writeFile(path.resolve(value), `${redactedJson(rows)}\n`, 'utf8');
      return rows;
    }
    case 'export': return {
      loops: await getRecentLoops(10_000),
      patterns: await getErrorPatterns(),
      uncertain: await getUncertainTags(),
      mcp: await getMcpUsage(),
    };
    case 'voice': return { processed: true, text: String(request.text ?? '') };
    case 'codemap:update': return generateCodeMap({ projectDir });
    case 'db:vacuum': await vacuum(); return { vacuumed: true };
    case 'db:stats': return getDbStats();
    case 'db:check': return checkIntegrity();
  }
}

function parseNumericId(value: string | undefined): number {
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id < 1) throw new Error('A positive numeric pattern id is required.');
  return id;
}

function createLogsCommand(kind: 'history' | 'mcp' | 'uncertain', dataApi: Required<CliDataApi>): Command {
  return new Command(kind)
    .description(`Show ${kind} logs`)
    .option('-p, --project-dir <dir>', 'project directory', process.cwd())
    .action(async (commandOptions: { projectDir: string }) => {
      const rows = await dataApi.logs(kind, { projectDir: commandOptions.projectDir });
      console.log(formatTable(rows));
    });
}

function createDataCommand(
  name: string,
  action: DataCommandAction,
  dataApi: Required<CliDataApi>,
  argument?: string,
): Command {
  const command = new Command(name)
    .description(`Run ${action}`)
    .option('-p, --project-dir <dir>', 'project directory', process.cwd());

  if (argument) {
    command.argument(argument);
  }

  return command.action(async (first: string | { projectDir: string } | undefined, second?: { projectDir: string }) => {
    const value = argument ? first as string | undefined : undefined;
    const commandOptions = (argument ? second : first as { projectDir: string } | undefined)
      ?? { projectDir: process.cwd() };
    const request = {
      value,
      projectDir: commandOptions.projectDir,
    };
    console.log(formatCommandResult(await dataApi.command(action, request)));
  });
}

function formatTable(rows: Array<Record<string, unknown>>): string {
  if (rows.length === 0) return 'No rows.';

  const headers = Array.from(new Set(rows.flatMap(row => Object.keys(row))));
  const lines = [
    headers.join('\t'),
    ...rows.map(row => headers.map(header => String(row[header] ?? '')).join('\t')),
  ];
  return lines.join('\n');
}

function formatCommandResult(result: unknown): string {
  if (Array.isArray(result)) return formatTable(result as Array<Record<string, unknown>>);
  if (result && typeof result === 'object') return redactedJson(result);
  return String(result ?? '');
}

function printWorkflowResult(result: unknown): void {
  console.log(formatCommandResult(result));
  if (result && typeof result === 'object' && 'success' in result && (result as { success?: unknown }).success === false) {
    process.exitCode = 1;
  }
  if (result && typeof result === 'object' && 'verified' in result && (result as { verified?: unknown }).verified === false) {
    process.exitCode = 1;
  }
}

function redactedJson(value: unknown): string {
  return JSON.stringify(value, (key, rawValue) => {
    if (/api[_-]?key|token|password|secret/i.test(key)) {
      return '[REDACTED]';
    }
    if (typeof rawValue === 'string' && /\bsk-[A-Za-z0-9_-]+\b/.test(rawValue)) {
      return '[REDACTED]';
    }
    return rawValue;
  }, 2);
}

function parseCliValue(value: string): string | number | boolean {
  if (value === 'true') return true;
  if (value === 'false') return false;
  if (/^-?\d+(\.\d+)?$/.test(value)) return Number(value);
  return value;
}

async function setConfigValue(projectDir: string, key: string, value: string): Promise<void> {
  try {
    await saveConfig(projectDir, { [key]: parseCliValue(value) });
  } catch (error) {
    await appendLooseYamlValue(projectDir, key, value);
    if (!(error instanceof Error)) return;
  }
}

async function appendLooseYamlValue(projectDir: string, key: string, value: string): Promise<void> {
  const configPath = path.join(projectDir, 'dev-loop.yaml');
  let existing = '';
  try {
    existing = await readFile(configPath, 'utf-8');
  } catch {
    // Missing config is fine; write a minimal file below.
  }

  const looseBlock = buildNestedYamlBlock(key.split('.'), value);
  const prefix = existing.trim().length > 0 ? existing.replace(/\s*$/, '\n\n') : '';
  await writeFile(configPath, `${prefix}${looseBlock}`, 'utf-8');
}

function buildNestedYamlBlock(parts: string[], value: string, depth = 0): string {
  const [head, ...tail] = parts;
  const indent = '  '.repeat(depth);
  if (!head) return '';
  if (tail.length === 0) {
    return `${indent}${head}: ${formatYamlScalar(value)}\n`;
  }
  return `${indent}${head}:\n${buildNestedYamlBlock(tail, value, depth + 1)}`;
}

function formatYamlScalar(value: string): string {
  if (value === 'true' || value === 'false' || /^-?\d+(\.\d+)?$/.test(value)) {
    return value;
  }
  return /^[A-Za-z0-9._/-]+$/.test(value) ? value : JSON.stringify(value);
}
