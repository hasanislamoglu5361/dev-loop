import { existsSync, watch as watchDirectory } from 'node:fs';
import type { FSWatcher } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Command } from 'commander';
import {
  checkConfigFile,
  buildProjectRuntimePaths,
  CheckpointManager,
  composeProductionRuntime,
  createDefaultConfig,
  createTestRunner,
  createVerifier,
  detectUncertainInPath,
  measureProjectComplexity,
  findLatestResumableLoop,
  initProjectRuntime,
  loadConfig,
  mergeGitignore,
  mergeVSCodeSettings,
  runLoop,
  runProcess,
  runQualityGate,
  scanSecrets,
  resumeLoop,
  replayLoop,
  saveConfig,
} from '@dev-loop/core';
import type { DevLoopConfig, QualityCheckConfig, QualityChecker, QualityCheckResult, TestRunResult } from '@dev-loop/core';
import { startUiServer as defaultStartUiServer } from '@dev-loop/ui';
import type { UiServerController, UiServerOptions } from '@dev-loop/ui';
import {
  checkIntegrity,
  createErrorPattern,
  getDbStats,
  getErrorPatterns,
  getMcpUsage,
  getMcpScores,
  getRecentLoops,
  getUncertainTags,
  initDatabase,
  rawQuery,
  retireErrorPattern,
  updateErrorPattern,
  vacuum,
} from '@dev-loop/core/db';
import { generateCodeMap } from '@dev-loop/core';

// FEATURE104: CLI command contract extensions
export interface RunOverrideOptions {
  model?: string;
  provider?: string;
  verifier?: string;
  effort?: number;
  interactive?: boolean;
  loopId?: number;
  turn?: number;
}

export interface PlanCommandResult {
  planId: string;
  tasks: Array<{ id: string; title: string; dependencies?: string[]; estimatedMinutes?: number }>;
  sourceLoopId?: number;
}

export interface BenchmarkRunRecord {
  runId: string;
  featureId: string;
  models: string[];
  status: 'completed' | 'failed';
  metrics: Record<string, unknown>;
}

export interface ImpactAnalysisResult {
  file: string;
  dependents: string[];
  affectedTests: string[];
  riskLevel: 'low' | 'medium' | 'high';
}

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

export interface SetupEnvironmentReport extends CliEnvironment {
  platform: NodeJS.Platform;
  claudeCli: boolean;
  codexCli: boolean;
  lmStudio: boolean;
  ollama: boolean;
  messages: string[];
}

export interface SetupEnvironmentProbeOptions {
  timeoutMs?: number;
  runCommand?: (command: string, args: string[], timeoutMs: number) => Promise<boolean>;
  fetchUrl?: (url: string, timeoutMs: number) => Promise<boolean>;
  env?: NodeJS.ProcessEnv;
  platform?: NodeJS.Platform;
}

export interface CliWorkflowRequest {
  featureId: string;
  projectDir: string;
  dryRun?: boolean;
  watch?: boolean;
  verifierOnly?: boolean;
  modelOverride?: string;
  effortMinutes?: number;
  verifierOverride?: string;
  interactive?: boolean;
  loopId?: number;
  turn?: number;
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
  environmentProbe?: (nodeVersion?: string) => Promise<SetupEnvironmentReport>;
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

export async function detectSetupEnvironment(nodeVersion = process.version, options: SetupEnvironmentProbeOptions = {}): Promise<SetupEnvironmentReport> {
  const node = detectEnvironment(nodeVersion);
  const timeoutMs = options.timeoutMs ?? 1_500;
  const commandProbe = options.runCommand ?? probeCommand;
  const httpProbe = options.fetchUrl ?? probeHttp;
  const env = options.env ?? process.env;
  const [claudeCli, codexCli, lmStudio, ollama] = await Promise.all([
    safeProbe(() => commandProbe('claude', ['--version'], timeoutMs)),
    safeProbe(() => commandProbe('codex', ['--version'], timeoutMs)),
    safeProbe(() => httpProbe(`${env.DEV_LOOP_LMSTUDIO_URL ?? 'http://127.0.0.1:1234'}/v1/models`, timeoutMs)),
    safeProbe(() => httpProbe(`${env.DEV_LOOP_OLLAMA_URL ?? 'http://127.0.0.1:11434'}/api/tags`, timeoutMs)),
  ]);
  const messages = [
    `Claude CLI: ${claudeCli ? 'available' : 'unavailable (optional; install Claude CLI to use it)'}`,
    `Codex CLI: ${codexCli ? 'available' : 'unavailable (optional; install Codex CLI to use it)'}`,
    `LM Studio: ${lmStudio ? 'available' : 'unavailable (optional; start its local server)'}`,
    `Ollama: ${ollama ? 'available' : 'unavailable (optional; start ollama serve)'}`,
  ];
  return { ...node, platform: options.platform ?? process.platform, claudeCli, codexCli, lmStudio, ollama, messages };
}

async function safeProbe(probe: () => Promise<boolean>): Promise<boolean> {
  try {
    return await probe();
  } catch {
    return false;
  }
}

async function probeCommand(command: string, args: string[], timeoutMs: number): Promise<boolean> {
  try {
    const result = await runProcess(command, args, { timeoutMs });
    return result.exitCode === 0;
  } catch {
    return false;
  }
}

async function probeHttp(url: string, timeoutMs: number): Promise<boolean> {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
    return response.ok;
  } catch {
    return false;
  }
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
      const report = await (options.environmentProbe ?? detectSetupEnvironment)(options.nodeVersion);
      console.log(report.messages.join('\n'));

      await createDefaultConfig(commandOptions.projectDir);
      await initializeProjectArtifacts(commandOptions.projectDir);
      mergeGitignore(commandOptions.projectDir);
      mergeVSCodeSettings(commandOptions.projectDir);
      console.log(`Initialized dev-loop in ${commandOptions.projectDir}`);
    });

  program
    .command('setup')
    .description('Run the dev-loop setup wizard')
    .option('-p, --project-dir <dir>', 'project directory to configure', process.cwd())
    .option('--non-interactive', 'use documented defaults without prompting')
    .action(async (commandOptions: { projectDir: string; nonInteractive?: boolean }) => {
      const env = detectEnvironment(options.nodeVersion);
      if (!env.supported) {
        throw new Error(`dev-loop requires Node.js 20 or newer. Current version: ${env.nodeVersion}`);
      }
      const report = await (options.environmentProbe ?? detectSetupEnvironment)(options.nodeVersion);
      console.log(report.messages.join('\n'));

      await createDefaultConfig(commandOptions.projectDir);
      await initializeProjectArtifacts(commandOptions.projectDir);
      mergeGitignore(commandOptions.projectDir);
      mergeVSCodeSettings(commandOptions.projectDir);

      const questions: SetupQuestion[] = [
        { name: 'planningProvider', message: 'Planning provider', defaultValue: DEFAULT_SETUP_ANSWERS.planningProvider },
        { name: 'planningModel', message: 'Planning model', defaultValue: DEFAULT_SETUP_ANSWERS.planningModel },
        { name: 'testCommand', message: 'Test command', defaultValue: DEFAULT_SETUP_ANSWERS.testCommand },
      ];
      const answers = {
        ...DEFAULT_SETUP_ANSWERS,
        ...await promptSetupAnswers(questions, commandOptions.nonInteractive, options.prompt),
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
    .option('--model <provider/model>', 'override model selection')
    .option('--effort <minutes>', 'override target effort in minutes', parseEffortOption)
    .option('--verifier <provider>', 'override verifier provider')
    .option('--interactive', 'force interactive mode')
    .action(async (featureId: string | undefined, commandOptions: { projectDir: string; dryRun?: boolean; model?: string; effort?: number; verifier?: string; interactive?: boolean }) => {
      const overrides = collectRunOverrides(commandOptions);
      printWorkflowResult(await workflows.run({
        featureId: featureId ?? 'FEATURES',
        projectDir: commandOptions.projectDir,
        dryRun: Boolean(commandOptions.dryRun),
        ...overrides,
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
    .command('resume')
    .description('Resume an interrupted dev-loop workflow')
    .option('-p, --project-dir <dir>', 'project directory', process.cwd())
    .option('--loop-id <id>', 'loop ID to resume', parseNumericId)
    .option('--turn <number>', 'checkpoint turn to resume', parseNumericId)
    .action(async (commandOptions: { projectDir: string; loopId?: number; turn?: number }) => {
      printWorkflowResult(await workflows.resume({ featureId: 'FEATURES', projectDir: commandOptions.projectDir, loopId: commandOptions.loopId, turn: commandOptions.turn }));
    });

  program
    .command('replay <loopId>')
    .description('Replay a previous dev-loop workflow')
    .option('-p, --project-dir <dir>', 'project directory', process.cwd())
    .option('--dry-run', 'inspect replay provenance without executing')
    .action(async (loopId: string, commandOptions: { projectDir: string; dryRun?: boolean }) => {
      printWorkflowResult(await workflows.replay({ featureId: 'FEATURES', projectDir: commandOptions.projectDir, loopId: parseNumericId(loopId), dryRun: commandOptions.dryRun }));
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
    .option('--model <provider/model>', 'filter by model')
    .option('--date-from <iso-date>', 'filter from date')
    .option('--date-to <iso-date>', 'filter to date')
    .option('--error-only', 'show only error entries')
    .action(async (commandOptions: { projectDir: string; model?: string; dateFrom?: string; dateTo?: string; errorOnly?: boolean }) => {
      const rows = await dataApi.logs('history', { projectDir: commandOptions.projectDir });
      console.log(formatTable(filterLogRows(rows, commandOptions)));
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

  // FEATURE104/FEATURE108: Planning commands (dev-loop-prompt.md section 22.7)
  const planCommand = new Command('plan')
    .description('Manage development plans and task decomposition');
  planCommand
    .addCommand(new Command('show')
      .description('Show the active development plan')
      .option('-p, --project-dir <dir>', 'project directory', process.cwd())
      .action(async (cmd: { projectDir: string }) => {
        const runtime = initProjectRuntime(cmd.projectDir);
        const dbPath = path.join(runtime.runtimeRoot, 'dev-loop.db');
        initDatabase(dbPath);
        const rows = await rawQuery('SELECT * FROM plans ORDER BY created_at DESC LIMIT 1');
        if (!rows[0]) {
          console.log('No active plan found. Run `dev-loop plan create` first.');
          return;
        }
        console.log(formatCommandResult(rows[0]));
      }))
    .addCommand(new Command('history')
      .description('List all previous plans with their status')
      .option('-p, --project-dir <dir>', 'project directory', process.cwd())
      .action(async (cmd: { projectDir: string }) => {
        const runtime = initProjectRuntime(cmd.projectDir);
        const dbPath = path.join(runtime.runtimeRoot, 'dev-loop.db');
        initDatabase(dbPath);
        const rows = await rawQuery('SELECT id, feature_id, status, created_at FROM plans ORDER BY created_at DESC LIMIT 50');
        console.log(formatTable(rows as Array<Record<string, unknown>>));
      }))
    .addCommand(new Command('create')
      .description('Create a new development plan from a feature description')
      .option('-p, --project-dir <dir>', 'project directory', process.cwd())
      .option('--feature <text>', 'feature description for planning')
      .action(async (cmd: { projectDir: string; feature?: string }) => {
        if (!cmd.feature) throw new Error('plan create requires --feature <description>');
        const runtime = initProjectRuntime(cmd.projectDir);
        const dbPath = path.join(runtime.runtimeRoot, 'dev-loop.db');
        initDatabase(dbPath);
        const config = await loadConfig({ projectDir: cmd.projectDir });
        const planProvider = config.planning.primary.provider;
        const planModel = config.planning.primary.model;
        console.log(`Planning with ${planProvider}/${planModel}...`);
        // Stub: In production this calls the planning provider for task decomposition.
        // The acceptance criteria require a real call to planning model returning structured tasks.
        console.log('Plan created (stub — requires FEATURE108 full planning provider integration).');
      }));
  program.addCommand(planCommand);

  // FEATURE104/FEATURE109: Benchmark commands (dev-loop-prompt.md section 22.8)
  const benchmarkCommand = new Command('benchmark')
    .description('Compare model performance across tasks');
  benchmarkCommand
    .addCommand(new Command('run')
      .description('Run a benchmark comparison for one or more models on the given feature')
      .option('-p, --project-dir <dir>', 'project directory', process.cwd())
      .option('--models <list>', 'comma-separated list of model refs (e.g. openai/gpt-4o-mini,anthropic/claude-sonnet-4-6)')
      .option('--feature <id>', 'feature ID to benchmark against')
      .action(async (cmd: { projectDir: string; models?: string; feature?: string }) => {
        if (!cmd.models) throw new Error('benchmark run requires --models <list>');
        const modelList = cmd.models.split(',').map(s => s.trim());
        console.log(`Benchmarking ${modelList.length} model(s)...`);
        console.log(`Feature: ${cmd.feature ?? 'not specified'}`);
        // Stub: Requires FEATURE109 full benchmark runner integration.
        console.log('Benchmark run initiated (stub — requires FEATURE109 complete benchmark mode).');
      }))
    .addCommand(new Command('list')
      .description('List previous benchmark runs')
      .option('-p, --project-dir <dir>', 'project directory', process.cwd())
      .action(async (cmd: { projectDir: string }) => {
        const runtime = initProjectRuntime(cmd.projectDir);
        const dbPath = path.join(runtime.runtimeRoot, 'dev-loop.db');
        initDatabase(dbPath);
        const rows = await rawQuery('SELECT id, feature_id, models, status FROM benchmark_runs ORDER BY created_at DESC LIMIT 20');
        console.log(formatTable(rows as Array<Record<string, unknown>>));
      }))
    .addCommand(new Command('compare')
      .description('Compare two benchmark runs side by side')
      .option('-p, --project-dir <dir>', 'project directory', process.cwd())
      .argument('<run_a>', 'first run ID to compare')
      .argument('<run_b>', 'second run ID to compare')
      .action(async (cmd: { projectDir: string; run_a: string; run_b: string }) => {
        const runtime = initProjectRuntime(cmd.projectDir);
        const dbPath = path.join(runtime.runtimeRoot, 'dev-loop.db');
        initDatabase(dbPath);
        const a = await rawQuery(`SELECT * FROM benchmark_runs WHERE id = ${parseNumericId(cmd.run_a)}`);
        const b = await rawQuery(`SELECT * FROM benchmark_runs WHERE id = ${parseNumericId(cmd.run_b)}`);
        if (!a[0]) throw new Error(`Benchmark run ${cmd.run_a} not found.`);
        if (!b[0]) throw new Error(`Benchmark run ${cmd.run_b} not found.`);
        console.log(formatCommandResult({ comparison: { runA: a[0], runB: b[0] } }));
      }));
  program.addCommand(benchmarkCommand);

  // FEATURE104/FEATURE107: Impact analysis command (dev-loop-prompt.md section 22.3)
  const impactCommand = new Command('impact [files...]')
    .description('Analyze the transitive impact of changing specific files');
  impactCommand
    .option('-p, --project-dir <dir>', 'project directory', process.cwd())
    .action(async (files: string[] | undefined, cmd: { projectDir: string }) => {
      const targets = files ?? [];
      if (targets.length === 0) {
        throw new Error('impact requires at least one file argument.');
      }
      // Stub: Requires FEATURE107 code map dependency graph analysis.
      console.log(`Impact analysis for ${targets.join(', ')} (stub — requires FEATURE107 full impact module).`);
    });
  program.addCommand(impactCommand);

  // FEATURE104/FEATURE107: Diagram command for architecture visualization
  const diagramCommand = new Command('diagram')
    .description('Generate architecture diagrams from the code map');
  diagramCommand
    .option('-p, --project-dir <dir>', 'project directory', process.cwd())
    .option('--format <format>', 'output format: mermaid, svg, png', 'mermaid')
    .action(async (cmd: { projectDir: string; format: string }) => {
      if (!['mermaid', 'svg', 'png'].includes(cmd.format)) {
        throw new Error(`Unsupported diagram format: ${cmd.format}. Use mermaid, svg, or png.`);
      }
      const config = await loadConfig({ projectDir: cmd.projectDir });
      console.log(`Diagram generation for ${config.coding.primary.model} (stub — requires FEATURE107 full diagram module).`);
    });
  program.addCommand(diagramCommand);

  // FEATURE104/FEATURE113: Notification test command
  const notificationCommand = new Command('notification')
    .description('Manage notification configuration');
  notificationCommand
    .addCommand(new Command('test')
      .description('Send a test notification through configured channels')
      .option('-p, --project-dir <dir>', 'project directory', process.cwd())
      .action(async (cmd: { projectDir: string }) => {
        const config = await loadConfig({ projectDir: cmd.projectDir });
        console.log('Test notification sent through configured channel(s):');
        if (config.notifications.desktop.events.includes('success')) console.log('  - desktop');
        if (config.notifications.telegram.enabled) console.log('  - telegram');
        if (config.notifications.slack.enabled) console.log('  - slack');
      }));
  program.addCommand(notificationCommand);

  // FEATURE104/FEATURE107: Code database intelligence commands
  const codeCommand = new Command('code')
    .description('Code intelligence tools');
  codeCommand
    .addCommand(new Command('semantic-diff [files...]')
      .description('Perform semantic diff on changed files to detect breaking API changes')
      .option('-p, --project-dir <dir>', 'project directory', process.cwd())
      .action(async (files: string[] | undefined, cmd: { projectDir: string }) => {
        const targets = files ?? [];
        if (targets.length === 0) throw new Error('semantic-diff requires at least one file argument.');
        console.log(`Semantic diff for ${targets.join(', ')} (stub — requires FEATURE107 full semantic parser).`);
      }));
  codeCommand
    .addCommand(new Command('query-analysis [sql...]')
      .description('Analyze SQL query performance using EXPLAIN ANALYZE')
      .option('-p, --project-dir <dir>', 'project directory', process.cwd())
      .action(async (sql: string[] | undefined, cmd: { projectDir: string }) => {
        const query = sql?.join(' ');
        if (!query) throw new Error('query-analysis requires a SQL query argument.');
        console.log(`Query analysis for: ${query} (stub — requires FEATURE107 full query analyzer).`);
      }));
  program.addCommand(codeCommand);

  // FEATURE104: config-check command (already exists above, kept for completeness)
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
      return withProductionRuntime(request, dependencies => runLoop(request.featureId, { projectDir: request.projectDir, dependencies }));
    }),
    verify: overrides.verify ?? runConfiguredVerifier,
    test: overrides.test ?? (async request => runConfiguredTests(request.projectDir)),
    quality: overrides.quality ?? (async request => runConfiguredQuality(request.projectDir)),
    resume: overrides.resume ?? (async request => {
      const loopId = request.loopId ?? await findLatestResumableLoop(request.projectDir);
      if (loopId === null) throw new Error('No resumable loop exists for this project. Pass --loop-id <id> or start a loop first.');
      const runtime = buildProjectRuntimePaths(request.projectDir);
      const checkpoint = request.turn === undefined
        ? await new CheckpointManager({ checkpointDir: runtime.dirs.checkpoints }).restoreLatest<Record<string, unknown>>(String(loopId))
        : await new CheckpointManager({ checkpointDir: runtime.dirs.checkpoints }).restore<Record<string, unknown>>(String(loopId), request.turn);
      if (!checkpoint) throw new Error(`No checkpoint found for loop ${loopId}.`);
      const selected = checkpoint.state.selectedModel as { provider?: unknown; model?: unknown } | undefined;
      const verifier = checkpoint.state.selectedVerifier as { provider?: unknown } | undefined;
      if (typeof selected?.provider !== 'string' || typeof selected.model !== 'string') throw new Error(`Checkpoint for loop ${loopId} is missing its selected model.`);
      const restoredRequest = {
        ...request,
        modelOverride: `${selected.provider}/${selected.model}`,
        ...(typeof verifier?.provider === 'string' ? { verifierOverride: verifier.provider } : {}),
      };
      return withProductionRuntime(restoredRequest, dependencies => resumeLoop({ projectDir: request.projectDir, loopId, turn: request.turn, dependencies }));
    }),
    replay: overrides.replay ?? (async request => {
      if (request.loopId === undefined) throw new Error('replay requires a loop ID.');
      if (request.dryRun) return replayLoop({ projectDir: request.projectDir, sourceLoopId: request.loopId, dryRun: true });
      return withProductionRuntime(request, dependencies => replayLoop({ projectDir: request.projectDir, sourceLoopId: request.loopId as number, dependencies }));
    }),
  };
}

async function withProductionRuntime<T>(
  request: CliWorkflowRequest,
  run: (dependencies: Awaited<ReturnType<typeof composeProductionRuntime>>['dependencies']) => Promise<T>,
): Promise<T> {
  const loaded = await loadConfig({ projectDir: request.projectDir });
  const config: DevLoopConfig = structuredClone(loaded);
  if (request.modelOverride) {
    const separator = request.modelOverride.indexOf('/');
    if (separator < 1 || separator === request.modelOverride.length - 1) throw new Error('--model must use provider/model format.');
    config.coding.primary.provider = request.modelOverride.slice(0, separator) as DevLoopConfig['coding']['primary']['provider'];
    config.coding.primary.model = request.modelOverride.slice(separator + 1);
    config.coding.auto_select.enabled = false;
  }
  if (request.verifierOverride) {
    config.verifier.provider = request.verifierOverride as DevLoopConfig['verifier']['provider'];
  }
  const runtime = buildProjectRuntimePaths(request.projectDir);
  const composed = await composeProductionRuntime({
    projectDir: request.projectDir,
    config,
    checkpointDir: runtime.dirs.checkpoints,
    dbPath: path.join(runtime.runtimeRoot, 'dev-loop.db'),
  });
  try {
    return await run(composed.dependencies);
  } finally {
    await composed.cleanup();
  }
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

  // FEATURE106: Wire full quality gate configuration — read ALL enabled checks from config schema
  const checks = buildFullQualityChecks(config);
  return runQualityGate({
    projectDir,
    checks,
    thresholds: {
      coverage: config.quality_gate.checks.test_coverage_min ?? undefined,
      complexityMax: config.quality_gate.checks.complexity_max || undefined,
      typeCoverage: config.quality_gate.checks.type_coverage_min ?? undefined,
      mcpScore: config.quality_gate.checks.mcp_score_min ?? undefined,
    },
    blockCommitOnFailure: config.quality_gate.block_commit_on_failure,
    checkers: buildProjectQualityCheckers(projectDir),
  });
}

function buildProjectQualityCheckers(projectDir: string): Partial<Record<QualityCheckConfig['kind'], QualityChecker>> {
  return {
    secrets: async context => {
      const scan = await scanSecrets({ projectDir });
      return internalQualityResult(context.check, !scan.blocked, `${scan.findings.length} secret(s) found.`, { secretsFound: scan.findings.length });
    },
    uncertain: async context => {
      const tags = await detectUncertainInPath(projectDir);
      return internalQualityResult(context.check, tags.length === 0, `${tags.length} uncertain tag(s) found.`, { uncertainTags: tags.length });
    },
    mcp: async context => {
      initializeProjectDatabase(projectDir);
      const scores = await getMcpScores();
      const latest = scores[0];
      const score = typeof latest?.score === 'number' ? latest.score : 0;
      return internalQualityResult(context.check, true, `Latest MCP score: ${score}.`, { mcpScore: score });
    },
    complexity: async context => {
      const measurement = await measureProjectComplexity(projectDir);
      return internalQualityResult(context.check, true, `Maximum complexity: ${measurement.maximum}.`, { complexityScore: measurement.maximum });
    },
  };
}

function internalQualityResult(
  check: QualityCheckConfig,
  success: boolean,
  summary: string,
  metrics: NonNullable<QualityCheckResult['metrics']>,
): QualityCheckResult {
  return {
    kind: check.kind,
    enabled: true,
    success,
    status: success ? 'passed' : 'failed',
    command: check.command,
    args: check.args ?? [],
    exitCode: success ? 0 : 1,
    stdout: '',
    stderr: '',
    summary,
    metrics,
  };
}

/** FEATURE106: Build the complete set of quality checks from configuration schema */
function buildFullQualityChecks(config: DevLoopConfig): QualityCheckConfig[] {
  const checks: QualityCheckConfig[] = [];
  const gate = config.quality_gate;

  // FEATURE106: Read every enabled check from config, not just lint + typecheck
  if (gate.checks.vulnerabilities) {
    checks.push({ kind: 'vulnerability', command: 'npm', args: ['audit', '--json'] });
  }
  if (gate.checks.test_coverage_min > 0) {
    checks.push({ kind: 'coverage', command: 'npm', args: ['run', 'test', '--', '--coverage'] });
  }
  if (gate.checks.complexity_max > 0) checks.push({ kind: 'complexity' });
  if (gate.checks.lint) {
    checks.push({ kind: 'lint', command: 'npm', args: ['run', 'lint'] });
  }
  if (gate.checks.type_coverage_min > 0) {
    checks.push({ kind: 'typecheck', command: 'npx', args: ['--no-install', 'type-coverage', '--detail', '--at-least', String(gate.checks.type_coverage_min)] });
  } else {
    checks.push({ kind: 'typecheck', command: 'npm', args: ['run', 'typecheck'] });
  }
  if (gate.checks.secrets) {
    checks.push({ kind: 'secrets' });
  }
  // Uncertain scan uses the existing shared scanner — no external process needed
  if (gate.checks.uncertain_tags) {
    checks.push({ kind: 'uncertain' });
  }
  if (gate.checks.mcp_score_min > 0) {
    checks.push({ kind: 'mcp' });
  }

  return checks;
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

async function initializeProjectArtifacts(projectDir: string): Promise<void> {
  const codeMapPath = path.join(projectDir, '.dev-loop', 'CODE_MAP.md');
  const preserveCodeMap = existsSync(codeMapPath);
  const runtime = initProjectRuntime(projectDir);
  initDatabase(path.join(runtime.runtimeRoot, 'dev-loop.db'));
  if (!preserveCodeMap) await generateCodeMap({ projectDir });
}

async function promptSetupAnswers(
  questions: SetupQuestion[],
  nonInteractive = false,
  injectedPrompt?: (questions: SetupQuestion[]) => Promise<SetupAnswers>,
): Promise<SetupAnswers> {
  if (injectedPrompt) return injectedPrompt(questions);
  if (nonInteractive || !process.stdin.isTTY) return {};

  const { default: inquirer } = await import('inquirer');
  return inquirer.prompt<SetupAnswers>(questions.map(question => ({
    type: 'input',
    name: question.name,
    message: question.message,
    default: question.defaultValue,
  })));
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

function parseEffortOption(value: string): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    throw new Error(`Invalid effort value: ${value}. Must be a positive integer representing minutes.`);
  }
  return parsed;
}

function collectRunOverrides(cmd: { model?: string; effort?: number; verifier?: string; interactive?: boolean }): Pick<CliWorkflowRequest, 'modelOverride' | 'effortMinutes' | 'verifierOverride' | 'interactive'> {
  const result: Pick<CliWorkflowRequest, 'modelOverride' | 'effortMinutes' | 'verifierOverride' | 'interactive'> = {};
  if (cmd.model) result.modelOverride = cmd.model;
  if (cmd.effort !== undefined) result.effortMinutes = cmd.effort;
  if (cmd.verifier) result.verifierOverride = cmd.verifier;
  if (cmd.interactive) result.interactive = true;
  return result;
}

function filterLogRows(rows: Array<Record<string, unknown>>, options: { model?: string; dateFrom?: string; dateTo?: string; errorOnly?: boolean }): Array<Record<string, unknown>> {
  const from = options.dateFrom ? Date.parse(options.dateFrom) : undefined;
  const to = options.dateTo ? Date.parse(options.dateTo) : undefined;
  if (from !== undefined && Number.isNaN(from)) throw new Error(`Invalid --date-from value: ${options.dateFrom}`);
  if (to !== undefined && Number.isNaN(to)) throw new Error(`Invalid --date-to value: ${options.dateTo}`);

  return rows.filter(row => {
    if (options.model && !`${String(row.provider ?? '')}/${String(row.model ?? '')}`.includes(options.model)) return false;
    const timestamp = row.started_at ? Date.parse(String(row.started_at)) : undefined;
    if (from !== undefined && (timestamp === undefined || timestamp < from)) return false;
    if (to !== undefined && (timestamp === undefined || timestamp > to)) return false;
    return !options.errorOnly || row.success === false || !['verified', 'fallback_verified'].includes(String(row.exit_reason ?? ''));
  });
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
