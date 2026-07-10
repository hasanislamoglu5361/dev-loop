import path from 'node:path';
import { readFile, rm } from 'node:fs/promises';
import { loadConfig } from '../config/loader.js';
import type { DevLoopConfig } from '../config/schema.js';
import { initProjectRuntime } from '../context/init-runtime.js';
import { initDatabase } from '../db/connection.js';
import { completeLoop, createLoop, createLoopTurn, failLoop, getLoopDetail, getRecentLoops, saveMcpScore, updateLoop } from '../db/queries/index.js';
import { CostTracker } from '../utils/cost-calculator.js';
import { readFileSafe, writeFileAtomic } from '../utils/file-system.js';
import { parseGeneratedFiles } from '../utils/generated-files.js';
import { resolveProjectPath } from '../utils/path-safety.js';
import type { ReviewFinding, ReviewResult, IVerifier } from '../models/verifier/types.js';
import { CheckpointManager } from './checkpoints.js';
import type { TestRunner, TestRunResult } from './test-runner.js';

export interface SelectedLoopTool {
  provider: string;
  model: string;
}

export interface LoopEngineDependencies {
  selectModel?: (config: DevLoopConfig) => SelectedLoopTool | Promise<SelectedLoopTool>;
  selectVerifier?: (config: DevLoopConfig) => SelectedLoopTool | Promise<SelectedLoopTool>;
  buildContext?: (request: BuildLoopContextRequest) => string | Promise<string>;
  generate?: (request: GenerateLoopTurnRequest) => LoopGenerationResult | Promise<LoopGenerationResult>;
  testRunner?: TestRunner;
  verifier?: Pick<IVerifier, 'review'>;
  buildFallbackContext?: (request: FallbackContextRequest) => string | Promise<string>;
  fallbackGenerate?: (request: GenerateLoopTurnRequest) => LoopGenerationResult | Promise<LoopGenerationResult>;
  fallbackVerifier?: Pick<IVerifier, 'review'>;
  collectDiff?: (request: LoopReviewContextRequest) => string | Promise<string>;
  collectUncertainTags?: (request: LoopReviewContextRequest) => string[] | Promise<string[]>;
  collectMcpUsage?: (request: LoopReviewContextRequest) => unknown[] | Promise<unknown[]>;
  collectSource?: (request: FallbackContextRequest) => string | Promise<string>;
  collectPatterns?: (request: FallbackContextRequest) => string[] | Promise<string[]>;
  successHooks?: LoopSuccessHooks;
  qualityGate?: (request: LoopReviewContextRequest) => Promise<{ success: boolean; blockCommit: boolean; summary?: string }>;
  notify?: (event: LoopNotificationEvent) => void | Promise<void>;
  now?: () => number;
}

export interface RunLoopOptions {
  projectDir: string;
  configPath?: string;
  dbPath?: string;
  featureSummary?: string;
  featureKeywords?: string;
  featureType?: string;
  language?: string;
  sourceLoopId?: number;
  dependencies?: LoopEngineDependencies;
}

export interface ResumeLoopOptions extends RunLoopOptions {
  loopId: number;
  turn?: number;
}

export interface ReplayLoopOptions extends RunLoopOptions {
  sourceLoopId: number;
  dryRun?: boolean;
  modelOverride?: SelectedLoopTool;
  verifierOverride?: SelectedLoopTool;
}

export interface ReplayDryRunResult {
  dryRun: true;
  sourceLoopId: number;
  featureId: string;
  selectedModel: SelectedLoopTool;
  selectedVerifier: SelectedLoopTool;
}

export interface LoopCheckpointState {
  phase: 'ready_for_turn' | 'completed';
  featureId: string;
  dbPath: string;
  selectedModel: SelectedLoopTool;
  selectedVerifier: SelectedLoopTool;
  nextTurn: number;
  turns: LoopTurnExecutionResult[];
  bugs: ReviewFinding[];
  focusFiles: string[];
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCostUsd: number;
  startedAt: number;
}

export interface LoopTimeTracker {
  startedAt: string;
  elapsedMs: number;
}

export interface BuildLoopContextRequest {
  featureId: string;
  loopId: number;
  turn: number;
  config: DevLoopConfig;
  bugs: ReviewFinding[];
  focusFiles: string[];
}

export interface GenerateLoopTurnRequest {
  context: string;
  model: SelectedLoopTool;
  config: DevLoopConfig;
}

export interface LoopGenerationResult {
  text: string;
  inputTokens?: number;
  outputTokens?: number;
  costUsd?: number;
}

export interface LoopTurnExecutionResult {
  turnNumber: number;
  success: boolean;
  generatedFiles: string[];
  testSummary: string;
  turnId: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

export interface LoopReviewContextRequest {
  featureId: string;
  loopId: number;
  turn: LoopTurnExecutionResult;
  config: DevLoopConfig;
}

export interface FallbackContextRequest {
  featureId: string;
  loopId: number;
  bugs: ReviewFinding[];
  source: string;
  patterns: string[];
  mcpUsage: unknown[];
  config: DevLoopConfig;
}

export type LoopExitReason =
  | 'initialized'
  | 'verified'
  | 'max_retry'
  | 'cost_budget'
  | 'time_budget'
  | 'fallback_verified'
  | 'fallback_failed'
  | 'quality_gate';

export interface LoopNotificationEvent {
  event: 'budget_exceeded' | 'fallback_failed' | 'quality_gate_failed' | 'success';
  featureId: string;
  loopId: number;
  reason: Extract<LoopExitReason, 'cost_budget' | 'time_budget' | 'fallback_failed' | 'quality_gate' | 'verified' | 'fallback_verified'>;
  message: string;
}

export interface LoopSuccessHookContext {
  featureId: string;
  loopId: number;
  config: DevLoopConfig;
  turns: LoopTurnExecutionResult[];
  exitReason: Extract<LoopExitReason, 'verified' | 'fallback_verified'>;
  fallbackUsed: boolean;
}

export type LoopSuccessHook = (context: LoopSuccessHookContext) => void | Promise<void>;

export interface LoopSuccessHooks {
  updateCodeMap?: LoopSuccessHook;
  updateDecisions?: LoopSuccessHook;
  updateDocs?: LoopSuccessHook;
  recordLearning?: LoopSuccessHook;
  updateCalibration?: LoopSuccessHook;
  commit?: LoopSuccessHook;
  createPullRequest?: LoopSuccessHook;
  updateTicket?: LoopSuccessHook;
  runSmokeTests?: LoopSuccessHook;
  exportFineTuneDataset?: LoopSuccessHook;
  syncObsidian?: LoopSuccessHook;
  updateCalendar?: LoopSuccessHook;
}

export class SuccessHookError extends Error {
  readonly code = 'success_hook.failed';
  readonly action = 'Fix or disable the failing success hook, then rerun the loop.';
  readonly hookName: string;

  constructor(hookName: string, cause: unknown) {
    const message = cause instanceof Error ? cause.message : String(cause);
    super(`Success hook "${hookName}" failed: ${message}`);
    this.name = 'SuccessHookError';
    Object.setPrototypeOf(this, new.target.prototype);
    this.hookName = hookName;
  }
}

export interface RunLoopInitializationResult {
  featureId: string;
  loopId: number;
  initialized: true;
  config: DevLoopConfig;
  dbPath: string;
  checkpointPath: string;
  selectedModel: SelectedLoopTool;
  selectedVerifier: SelectedLoopTool;
  cost: CostTracker;
  time: LoopTimeTracker;
  turns: LoopTurnExecutionResult[];
  success?: boolean;
  exitReason: LoopExitReason;
  notificationErrors: string[];
  successHooks?: string[];
  fallbackUsed?: boolean;
  turn?: LoopTurnExecutionResult;
}

export async function runLoop(
  featureId: string,
  options: RunLoopOptions,
): Promise<RunLoopInitializationResult> {
  const now = options.dependencies?.now ?? Date.now;
  const started = now();
  const runtime = initProjectRuntime(options.projectDir);
  const config = await loadConfig({
    projectDir: options.projectDir,
    configPath: options.configPath,
  });
  const dbPath = options.dbPath ?? path.join(runtime.runtimeRoot, 'dev-loop.db');

  initDatabase(dbPath);

  const selectedModel = await selectModel(config, options.dependencies);
  const selectedVerifier = await selectVerifier(config, options.dependencies);
  const loop = await createLoop(featureId, {
    featureSummary: options.featureSummary,
    featureKeywords: options.featureKeywords,
    featureType: options.featureType,
    language: options.language,
    primaryModel: selectedModel.model,
    primaryProvider: selectedModel.provider,
    verifierModel: selectedVerifier.model,
    verifierProvider: selectedVerifier.provider,
    sourceLoopId: options.sourceLoopId,
  });
  const checkpointManager = new CheckpointManager({ checkpointDir: runtime.dirs.checkpoints });

  await checkpointManager.save({
    version: 1,
    loopId: String(loop.id),
    turn: 0,
    state: {
      phase: 'ready_for_turn',
      featureId,
      dbPath,
      selectedModel,
      selectedVerifier,
      nextTurn: 1,
      turns: [],
      bugs: [],
      focusFiles: [],
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalCostUsd: 0,
      startedAt: started,
    },
  });

  const cost = new CostTracker();
  const result: RunLoopInitializationResult = {
    featureId,
    loopId: loop.id,
    initialized: true,
    config,
    dbPath,
    checkpointPath: path.join(runtime.dirs.checkpoints, `${loop.id}-turn-0.json`),
    selectedModel,
    selectedVerifier,
    cost,
    time: {
      startedAt: new Date(started).toISOString(),
      elapsedMs: now() - started,
    },
    turns: [],
    exitReason: 'initialized',
    notificationErrors: [],
  };

  if (shouldRunOneTurn(options.dependencies)) {
    const retryResult = await runTurnLoop({
      featureId,
      loopId: loop.id,
      projectDir: options.projectDir,
      sandboxDir: runtime.dirs.sandbox,
      bugsPath: runtime.files.BUGS,
      config,
      selectedModel,
      selectedVerifier,
      cost,
      started,
      notificationErrors: result.notificationErrors,
      dependencies: options.dependencies,
      checkpointManager,
    });
    result.turns = retryResult.turns;
    result.turn = retryResult.turns[retryResult.turns.length - 1];
    result.success = retryResult.success;
    result.exitReason = retryResult.exitReason;
    result.fallbackUsed = retryResult.fallbackUsed;
    result.successHooks = retryResult.successHooks;
    result.time = {
      ...result.time,
      elapsedMs: now() - started,
    };
  }

  return result;
}

export async function resumeLoop(options: ResumeLoopOptions): Promise<RunLoopInitializationResult> {
  const runtime = initProjectRuntime(options.projectDir);
  const manager = new CheckpointManager({ checkpointDir: runtime.dirs.checkpoints });
  const checkpoint = options.turn === undefined
    ? await manager.restoreLatest<LoopCheckpointState>(String(options.loopId))
    : await manager.restore<LoopCheckpointState>(String(options.loopId), options.turn);
  if (!checkpoint) throw new Error(`No checkpoint found for loop ${options.loopId}.`);
  assertLoopCheckpointState(checkpoint.state, options.loopId, checkpoint.turn);
  if (checkpoint.state.phase === 'completed') throw new Error(`Loop ${options.loopId} is already completed and cannot be resumed.`);

  initDatabase(checkpoint.state.dbPath);
  const loop = await getLoopDetail(options.loopId);
  if (!loop) throw new Error(`Loop ${options.loopId} does not exist in its checkpoint database.`);
  if (loop.completed_at !== null && loop.completed_at !== undefined) {
    throw new Error(`Loop ${options.loopId} is already terminal and cannot be resumed.`);
  }
  if (!shouldRunOneTurn(options.dependencies)) {
    throw new Error('Resume requires production loop dependencies.');
  }

  const config = await loadConfig({ projectDir: options.projectDir, configPath: options.configPath });
  const cost = new CostTracker();
  cost.restore(
    checkpoint.state.totalInputTokens,
    checkpoint.state.totalOutputTokens,
    checkpoint.state.totalCostUsd,
    checkpoint.state.selectedModel.provider,
    checkpoint.state.selectedModel.model,
  );
  const notificationErrors: string[] = [];
  const resumed = await runTurnLoop({
    featureId: checkpoint.state.featureId,
    loopId: options.loopId,
    projectDir: options.projectDir,
    sandboxDir: runtime.dirs.sandbox,
    bugsPath: runtime.files.BUGS,
    config,
    selectedModel: checkpoint.state.selectedModel,
    selectedVerifier: checkpoint.state.selectedVerifier,
    cost,
    started: checkpoint.state.startedAt,
    notificationErrors,
    dependencies: options.dependencies,
    checkpointManager: manager,
    resumeState: checkpoint.state,
  });
  return {
    featureId: checkpoint.state.featureId,
    loopId: options.loopId,
    initialized: true,
    config,
    dbPath: checkpoint.state.dbPath,
    checkpointPath: path.join(runtime.dirs.checkpoints, `${options.loopId}-turn-${checkpoint.turn}.json`),
    selectedModel: checkpoint.state.selectedModel,
    selectedVerifier: checkpoint.state.selectedVerifier,
    cost,
    time: { startedAt: new Date(checkpoint.state.startedAt).toISOString(), elapsedMs: (options.dependencies?.now ?? Date.now)() - checkpoint.state.startedAt },
    turns: resumed.turns,
    turn: resumed.turns[resumed.turns.length - 1],
    success: resumed.success,
    exitReason: resumed.exitReason,
    fallbackUsed: resumed.fallbackUsed,
    successHooks: resumed.successHooks,
    notificationErrors,
  };
}

function assertLoopCheckpointState(state: LoopCheckpointState, loopId: number, turn: number): void {
  const valid = state && typeof state === 'object'
    && state.phase === 'ready_for_turn'
    && typeof state.featureId === 'string'
    && typeof state.dbPath === 'string'
    && Number.isSafeInteger(state.nextTurn) && state.nextTurn >= 1
    && Array.isArray(state.turns) && Array.isArray(state.bugs) && Array.isArray(state.focusFiles)
    && Number.isFinite(state.totalInputTokens) && Number.isFinite(state.totalOutputTokens)
    && Number.isFinite(state.totalCostUsd) && Number.isFinite(state.startedAt)
    && typeof state.selectedModel?.provider === 'string' && typeof state.selectedModel?.model === 'string'
    && typeof state.selectedVerifier?.provider === 'string' && typeof state.selectedVerifier?.model === 'string';
  if (!valid) {
    throw new Error(`Checkpoint for loop ${loopId} turn ${turn} has unsafe or incomplete engine state. Restore a valid checkpoint.`);
  }
}

export async function findLatestResumableLoop(projectDir: string): Promise<number | null> {
  const runtime = initProjectRuntime(projectDir);
  initDatabase(path.join(runtime.runtimeRoot, 'dev-loop.db'));
  const manager = new CheckpointManager({ checkpointDir: runtime.dirs.checkpoints });
  const loops = await getRecentLoops(10_000);
  for (const loop of loops) {
    if (loop.completed_at !== null && loop.completed_at !== undefined) continue;
    const id = Number(loop.id);
    if (!Number.isSafeInteger(id) || id < 1) continue;
    if (await manager.restoreLatest(String(id))) return id;
  }
  return null;
}

export async function replayLoop(options: ReplayLoopOptions): Promise<RunLoopInitializationResult | ReplayDryRunResult> {
  const runtime = initProjectRuntime(options.projectDir);
  const dbPath = options.dbPath ?? path.join(runtime.runtimeRoot, 'dev-loop.db');
  initDatabase(dbPath);
  const source = await getLoopDetail(options.sourceLoopId);
  if (!source) throw new Error(`Replay source loop ${options.sourceLoopId} does not exist.`);
  const featureId = String(source.feature_id ?? 'FEATURES');
  const selectedModel = options.modelOverride ?? {
    provider: String(source.primary_provider ?? ''),
    model: String(source.primary_model ?? ''),
  };
  const selectedVerifier = options.verifierOverride ?? {
    provider: String(source.verifier_provider ?? ''),
    model: String(source.verifier_model ?? ''),
  };
  if (!selectedModel.provider || !selectedModel.model || !selectedVerifier.provider || !selectedVerifier.model) {
    throw new Error(`Replay source loop ${options.sourceLoopId} is missing its recorded model selection.`);
  }
  if (options.dryRun) {
    return { dryRun: true, sourceLoopId: options.sourceLoopId, featureId, selectedModel, selectedVerifier };
  }
  const dependencies: LoopEngineDependencies = {
    ...options.dependencies,
    selectModel: () => selectedModel,
    selectVerifier: () => selectedVerifier,
  };
  return runLoop(featureId, {
    ...options,
    dbPath,
    sourceLoopId: options.sourceLoopId,
    dependencies,
  });
}

async function selectModel(
  config: DevLoopConfig,
  dependencies?: LoopEngineDependencies,
): Promise<SelectedLoopTool> {
  return dependencies?.selectModel?.(config) ?? {
    provider: config.coding.primary.provider,
    model: config.coding.primary.model,
  };
}

async function selectVerifier(
  config: DevLoopConfig,
  dependencies?: LoopEngineDependencies,
): Promise<SelectedLoopTool> {
  return dependencies?.selectVerifier?.(config) ?? {
    provider: config.verifier.provider,
    model: config.verifier.model,
  };
}

interface RunPrimaryTurnOptions {
  featureId: string;
  loopId: number;
  turnNumber: number;
  projectDir: string;
  sandboxDir: string;
  bugsPath: string;
  config: DevLoopConfig;
  selectedModel: SelectedLoopTool;
  cost: CostTracker;
  buildContext: NonNullable<LoopEngineDependencies['buildContext']>;
  generate: NonNullable<LoopEngineDependencies['generate']>;
  testRunner: TestRunner;
  bugs: ReviewFinding[];
  focusFiles: string[];
}

interface RunTurnLoopOptions {
  featureId: string;
  loopId: number;
  projectDir: string;
  sandboxDir: string;
  bugsPath: string;
  config: DevLoopConfig;
  selectedModel: SelectedLoopTool;
  selectedVerifier: SelectedLoopTool;
  cost: CostTracker;
  started: number;
  notificationErrors: string[];
  dependencies?: LoopEngineDependencies;
  checkpointManager: CheckpointManager;
  resumeState?: LoopCheckpointState;
}

interface RunTurnLoopResult {
  turns: LoopTurnExecutionResult[];
  success: boolean;
  exitReason: LoopExitReason;
  fallbackUsed?: boolean;
  successHooks?: string[];
}

interface InternalTurnResult extends LoopTurnExecutionResult {
  testResult: TestRunResult;
  backups: AppliedFileBackup[];
}

interface AppliedFileBackup { absolutePath: string; content?: string }

function shouldRunOneTurn(dependencies?: LoopEngineDependencies): boolean {
  const provided = [
    dependencies?.buildContext,
    dependencies?.generate,
    dependencies?.testRunner,
  ].filter(Boolean).length;

  if (provided === 0) return false;
  if (provided === 3) return true;

  throw new Error('Loop turn execution requires buildContext, generate, and testRunner dependencies.');
}

interface BudgetStop {
  reason: Extract<LoopExitReason, 'cost_budget' | 'time_budget'>;
  message: string;
}

function budgetStopReason(options: RunTurnLoopOptions): BudgetStop | null {
  if (options.cost.total >= options.config.loop.cost_budget_usd) {
    return {
      reason: 'cost_budget',
      message: `Cost budget exceeded: $${options.cost.total} >= $${options.config.loop.cost_budget_usd}.`,
    };
  }

  const now = options.dependencies?.now ?? Date.now;
  const elapsedMs = now() - options.started;
  const budgetMs = options.config.loop.time_budget_minutes * 60_000;
  if (elapsedMs >= budgetMs) {
    return {
      reason: 'time_budget',
      message: `Time budget exceeded: ${elapsedMs}ms >= ${budgetMs}ms.`,
    };
  }

  return null;
}

async function failLoopForBudget(options: RunTurnLoopOptions, stop: BudgetStop): Promise<void> {
  await failLoop(options.loopId, { reason: stop.message });

  if (!options.dependencies?.notify) return;

  try {
    await options.dependencies.notify({
      event: 'budget_exceeded',
      featureId: options.featureId,
      loopId: options.loopId,
      reason: stop.reason,
      message: stop.message,
    });
  } catch (error) {
    options.notificationErrors.push(error instanceof Error ? error.message : String(error));
  }
}

async function runTurnLoop(options: RunTurnLoopOptions): Promise<RunTurnLoopResult> {
  const dependencies = options.dependencies as Required<
    Pick<LoopEngineDependencies, 'buildContext' | 'generate' | 'testRunner'>
  > & LoopEngineDependencies;
  const turns: LoopTurnExecutionResult[] = [...(options.resumeState?.turns ?? [])];
  let bugs: ReviewFinding[] = [...(options.resumeState?.bugs ?? [])];
  let focusFiles: string[] = [...(options.resumeState?.focusFiles ?? [])];
  const backups = new Map<string, AppliedFileBackup>();
  const maxRetry = options.config.loop.max_retry;

  for (let turnNumber = options.resumeState?.nextTurn ?? 1; turnNumber <= maxRetry; turnNumber += 1) {
    const budgetStop = budgetStopReason(options);
    if (budgetStop) {
      await failLoopForBudget(options, budgetStop);
      return {
        turns,
        success: false,
        exitReason: budgetStop.reason,
      };
    }

    const turn = await runPrimaryTurn({
      featureId: options.featureId,
      loopId: options.loopId,
      turnNumber,
      projectDir: options.projectDir,
      sandboxDir: options.sandboxDir,
      bugsPath: options.bugsPath,
      config: options.config,
      selectedModel: options.selectedModel,
      cost: options.cost,
      buildContext: dependencies.buildContext,
      generate: dependencies.generate,
      testRunner: dependencies.testRunner,
      bugs,
      focusFiles,
    });
    turns.push(stripInternalTurn(turn));
    for (const backup of turn.backups) if (!backups.has(backup.absolutePath)) backups.set(backup.absolutePath, backup);

    const verifier = dependencies.verifier;
    if (!verifier) {
      await saveReadyCheckpoint(options, turnNumber + 1, turns, bugs, focusFiles);
      return {
        turns,
        success: turn.success,
        exitReason: 'initialized',
      };
    }

    const review = await reviewTurn({
      featureId: options.featureId,
      loopId: options.loopId,
      turn,
      config: options.config,
      selectedVerifier: options.selectedVerifier,
      dependencies: { ...dependencies, verifier },
    });
    await saveMcpScore(options.loopId, {
      model: options.selectedVerifier.model,
      score: review.mcpScore.score,
      verifierNotes: review.summary,
    });

    bugs = review.findings;
    if (bugs.length === 0 && turn.success) {
      const gate = await runLoopQualityGate(options, stripInternalTurn(turn));
      if (gate?.blockCommit) {
        if (options.config.loop.auto_rollback) await rollbackAppliedFiles([...backups.values()]);
        return { turns, success: false, exitReason: 'quality_gate' };
      }
      const successHooks = await runSuccessHooks(options, {
        turns,
        exitReason: 'verified',
        fallbackUsed: false,
      });
      await completeLoop(options.loopId, {
        totalTurns: turns.length,
        totalInputTokens: totalNumber(turns, 'inputTokens'),
        totalOutputTokens: totalNumber(turns, 'outputTokens'),
        totalCostUsd: options.cost.total,
      });

      return {
        turns,
        success: true,
        exitReason: 'verified',
        successHooks,
      };
    }

    if (bugs.length > 0) {
      await appendVerifierBugs(options.bugsPath, {
        featureId: options.featureId,
        turnNumber,
        review,
      });
      focusFiles = options.config.loop.smart_retry ? focusFilesFromFindings(bugs) : [];
    }
    await saveReadyCheckpoint(options, turnNumber + 1, turns, bugs, focusFiles);
  }

  const buildFallbackContext = dependencies.buildFallbackContext;
  const fallbackGenerate = dependencies.fallbackGenerate;
  const fallbackVerifier = dependencies.fallbackVerifier;
  if (buildFallbackContext && fallbackGenerate && fallbackVerifier) {
    return runFallbackPath({
      ...options,
      turns,
      bugs,
      dependencies: {
        ...dependencies,
        buildFallbackContext,
        fallbackGenerate,
        fallbackVerifier,
      },
    });
  }

  return {
    turns,
    success: false,
    exitReason: 'max_retry',
  };
}

async function runLoopQualityGate(options: RunTurnLoopOptions, turn: LoopTurnExecutionResult) {
  if (!options.config.quality_gate.enabled || !options.dependencies?.qualityGate) return undefined;
  const gate = await options.dependencies.qualityGate({
    featureId: options.featureId,
    loopId: options.loopId,
    turn,
    config: options.config,
  });
  if (!gate.success && gate.blockCommit) {
    const message = gate.summary ?? 'Quality gate blocked the loop.';
    await failLoop(options.loopId, { reason: message });
    try {
      await options.dependencies.notify?.({ event: 'quality_gate_failed', featureId: options.featureId, loopId: options.loopId, reason: 'quality_gate', message });
    } catch (error) {
      options.notificationErrors.push(error instanceof Error ? error.message : String(error));
    }
  }
  return gate;
}

async function saveReadyCheckpoint(
  options: RunTurnLoopOptions,
  nextTurn: number,
  turns: LoopTurnExecutionResult[],
  bugs: ReviewFinding[],
  focusFiles: string[],
): Promise<void> {
  await options.checkpointManager.save({
    version: 1,
    loopId: String(options.loopId),
    turn: nextTurn - 1,
    state: {
      phase: 'ready_for_turn',
      featureId: options.featureId,
      dbPath: path.join(initProjectRuntime(options.projectDir).runtimeRoot, 'dev-loop.db'),
      selectedModel: options.selectedModel,
      selectedVerifier: options.selectedVerifier,
      nextTurn,
      turns,
      bugs,
      focusFiles,
      totalInputTokens: totalNumber(turns, 'inputTokens'),
      totalOutputTokens: totalNumber(turns, 'outputTokens'),
      totalCostUsd: options.cost.total,
      startedAt: options.started,
    } satisfies LoopCheckpointState,
  });
}

async function runSuccessHooks(
  options: RunTurnLoopOptions,
  params: {
    turns: LoopTurnExecutionResult[];
    exitReason: Extract<LoopExitReason, 'verified' | 'fallback_verified'>;
    fallbackUsed: boolean;
  },
): Promise<string[]> {
  const completed: string[] = [];
  const context: LoopSuccessHookContext = {
    featureId: options.featureId,
    loopId: options.loopId,
    config: options.config,
    turns: params.turns,
    exitReason: params.exitReason,
    fallbackUsed: params.fallbackUsed,
  };
  const hooks = options.dependencies?.successHooks;

  await runConfiguredHook('updateCodeMap', hooks?.updateCodeMap, context, completed, options.config.context.code_map);
  await runConfiguredHook('updateDecisions', hooks?.updateDecisions, context, completed, options.config.context.decisions);
  await runConfiguredHook('updateDocs', hooks?.updateDocs, context, completed, true);
  await runConfiguredHook(
    'recordLearning',
    hooks?.recordLearning,
    context,
    completed,
    options.config.learning.success_patterns.enabled || options.config.learning.error_patterns.enabled,
  );
  await runConfiguredHook('updateCalibration', hooks?.updateCalibration, context, completed, options.config.learning.model_calibration.enabled);
  await runConfiguredHook('commit', hooks?.commit, context, completed, options.config.git.auto_commit);
  await runConfiguredHook(
    'createPullRequest',
    hooks?.createPullRequest,
    context,
    completed,
    options.config.integrations.github.enabled && options.config.integrations.github.auto_pr,
  );
  await runConfiguredHook(
    'updateTicket',
    hooks?.updateTicket,
    context,
    completed,
    options.config.integrations.jira.enabled || options.config.integrations.linear.enabled,
  );
  await runConfiguredHook(
    'runSmokeTests',
    hooks?.runSmokeTests,
    context,
    completed,
    options.config.integrations.postman.enabled && options.config.integrations.postman.smoke_test_on_success,
  );
  await runConfiguredHook(
    'exportFineTuneDataset',
    hooks?.exportFineTuneDataset,
    context,
    completed,
    options.config.learning.fine_tune_dataset.enabled,
  );
  await runConfiguredHook('syncObsidian', hooks?.syncObsidian, context, completed, options.config.integrations.obsidian.enabled);
  await runConfiguredHook('updateCalendar', hooks?.updateCalendar, context, completed, options.config.integrations.calendar.enabled);

  if (options.dependencies?.notify && successNotificationEnabled(options.config)) {
    try {
      await options.dependencies.notify({
        event: 'success',
        featureId: options.featureId,
        loopId: options.loopId,
        reason: params.exitReason,
        message: 'Loop completed successfully.',
      });
      completed.push('notify');
    } catch (error) {
      throw new SuccessHookError('notify', error);
    }
  }

  return completed;
}

async function runConfiguredHook(
  name: keyof LoopSuccessHooks,
  hook: LoopSuccessHook | undefined,
  context: LoopSuccessHookContext,
  completed: string[],
  enabled: boolean,
): Promise<void> {
  if (!enabled || !hook) return;

  try {
    await hook(context);
    completed.push(name);
  } catch (error) {
    throw new SuccessHookError(name, error);
  }
}

function successNotificationEnabled(config: DevLoopConfig): boolean {
  return (
    config.notifications.desktop.events.includes('success') ||
    config.notifications.telegram.events.includes('success') ||
    config.notifications.slack.events.includes('success')
  );
}

async function runPrimaryTurn(options: RunPrimaryTurnOptions): Promise<InternalTurnResult> {
  const started = Date.now();
  const context = await options.buildContext({
    featureId: options.featureId,
    loopId: options.loopId,
    turn: options.turnNumber,
    config: options.config,
    bugs: options.bugs,
    focusFiles: options.focusFiles,
  });
  const generation = await options.generate({
    context,
    model: options.selectedModel,
    config: options.config,
  });
  const parsed = parseGeneratedFiles(generation.text);
  const generatedFiles = parsed.files.map(file => file.path);

  const backups = await writeGeneratedFiles({
    projectDir: options.projectDir,
    sandboxDir: options.sandboxDir,
    sandboxMode: options.config.loop.sandbox_mode,
    files: parsed.files,
  });

  const inputTokens = generation.inputTokens ?? 0;
  const outputTokens = generation.outputTokens ?? 0;
  const cost = options.cost.add(
    inputTokens,
    outputTokens,
    options.selectedModel.provider,
    options.selectedModel.model,
  );
  const testResult = await options.testRunner.run({
    config: options.config.test_runner,
    projectDir: options.projectDir,
    changedFiles: generatedFiles,
  });

  if (!testResult.success) {
    await appendBugReport(options.bugsPath, {
      featureId: options.featureId,
      turnNumber: options.turnNumber,
      testResult,
    });
  }

  const turn = await createLoopTurn({
    loopId: options.loopId,
    turnNumber: options.turnNumber,
    agent: 'primary',
    model: options.selectedModel.model,
    inputTokens,
    outputTokens,
    costUsd: generation.costUsd ?? cost.totalCostUsd,
    durationSeconds: (Date.now() - started) / 1000,
    success: testResult.success,
    errorMessage: testResult.success ? undefined : testResult.summary,
    errorType: testResult.success ? undefined : 'test_failure',
    filesChanged: generatedFiles,
  });

  return {
    turnNumber: options.turnNumber,
    success: testResult.success,
    generatedFiles,
    testSummary: testResult.summary,
    turnId: turn.id,
    inputTokens,
    outputTokens,
    costUsd: generation.costUsd ?? cost.totalCostUsd,
    testResult,
    backups,
  };
}

async function runFallbackPath(options: RunTurnLoopOptions & {
  turns: LoopTurnExecutionResult[];
  bugs: ReviewFinding[];
  dependencies: Required<
    Pick<LoopEngineDependencies, 'buildFallbackContext' | 'fallbackGenerate' | 'fallbackVerifier'>
  > & LoopEngineDependencies;
}): Promise<RunTurnLoopResult> {
  let lastReview: ReviewResult | null = null;
  const fallbackModelName = options.config.fallback.model ?? options.config.fallback.provider;
  const attempts = options.config.fallback.max_attempts;
  const mcpUsage = await options.dependencies.collectMcpUsage?.({
    featureId: options.featureId,
    loopId: options.loopId,
    turn: options.turns[options.turns.length - 1] as LoopTurnExecutionResult,
    config: options.config,
  }) ?? [];
  const fallbackContextRequest: FallbackContextRequest = {
    featureId: options.featureId,
    loopId: options.loopId,
    bugs: options.bugs,
    source: '',
    patterns: [],
    mcpUsage,
    config: options.config,
  };
  fallbackContextRequest.source = await options.dependencies.collectSource?.(fallbackContextRequest) ?? '';
  fallbackContextRequest.patterns = await options.dependencies.collectPatterns?.(fallbackContextRequest) ?? [];

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const context = await options.dependencies.buildFallbackContext(fallbackContextRequest);
    const generation = await options.dependencies.fallbackGenerate({
      context,
      model: { provider: options.config.fallback.provider, model: fallbackModelName },
      config: options.config,
    });
    const parsed = parseGeneratedFiles(generation.text);
    const generatedFiles = parsed.files.map(file => file.path);
    await writeGeneratedFiles({
      projectDir: options.projectDir,
      sandboxDir: options.sandboxDir,
      sandboxMode: options.config.loop.sandbox_mode,
      files: parsed.files,
    });
    const testResult = await options.dependencies.testRunner?.run({
      config: options.config.test_runner,
      projectDir: options.projectDir,
      changedFiles: generatedFiles,
    });
    const fallbackTestResult = testResult ?? {
      runner: 'none' as const,
      success: true,
      status: 'passed' as const,
      args: [],
      exitCode: 0,
      stdout: '',
      stderr: '',
      summary: 'fallback tests skipped',
      changedFiles: generatedFiles,
    };
    const turn = await createLoopTurn({
      loopId: options.loopId,
      turnNumber: options.turns.length + 1,
      agent: 'fallback',
      model: fallbackModelName,
      inputTokens: generation.inputTokens ?? 0,
      outputTokens: generation.outputTokens ?? 0,
      costUsd: generation.costUsd ?? 0,
      success: fallbackTestResult.success,
      errorMessage: fallbackTestResult.success ? undefined : fallbackTestResult.summary,
      errorType: fallbackTestResult.success ? undefined : 'fallback_test_failure',
      filesChanged: generatedFiles,
    });
    const publicTurn: LoopTurnExecutionResult = {
      turnNumber: options.turns.length + 1,
      success: fallbackTestResult.success,
      generatedFiles,
      testSummary: fallbackTestResult.summary,
      turnId: turn.id,
      inputTokens: generation.inputTokens ?? 0,
      outputTokens: generation.outputTokens ?? 0,
      costUsd: generation.costUsd ?? 0,
    };
    options.turns.push(publicTurn);

    lastReview = await options.dependencies.fallbackVerifier.review({
      featureId: options.featureId,
      prompt: context,
      changedFiles: generatedFiles,
      metadata: {
        fallback: true,
        bugs: options.bugs,
        source: fallbackContextRequest.source,
        patterns: fallbackContextRequest.patterns,
        mcpUsage,
      },
    });

    await saveMcpScore(options.loopId, {
      model: fallbackModelName,
      score: lastReview.mcpScore.score,
      verifierNotes: lastReview.summary,
    });

    if (fallbackTestResult.success && lastReview.findings.length === 0) {
      const gate = await runLoopQualityGate(options, publicTurn);
      if (gate?.blockCommit) {
        return { turns: options.turns, success: false, exitReason: 'quality_gate', fallbackUsed: true };
      }
      const successHooks = await runSuccessHooks(options, {
        turns: options.turns,
        exitReason: 'fallback_verified',
        fallbackUsed: true,
      });
      await completeLoop(options.loopId, {
        totalTurns: options.turns.length,
        totalCostUsd: options.cost.total,
      });
      await updateLoop(options.loopId, {
        fallbackUsed: true,
        fallbackModel: fallbackModelName,
      });
      return {
        turns: options.turns,
        success: true,
        exitReason: 'fallback_verified',
        fallbackUsed: true,
        successHooks,
      };
    }
  }

  await failLoop(options.loopId, {
    reason: `Fallback failed${lastReview ? `: ${lastReview.summary}` : ''}`,
    bugs: lastReview?.findings,
  });
  await updateLoop(options.loopId, {
    fallbackUsed: true,
    fallbackModel: fallbackModelName,
  });
  await notifyFailure(options, 'fallback_failed', 'Fallback failed.');

  return {
    turns: options.turns,
    success: false,
    exitReason: 'fallback_failed',
    fallbackUsed: true,
  };
}

async function notifyFailure(
  options: RunTurnLoopOptions,
  reason: Extract<LoopExitReason, 'fallback_failed'>,
  message: string,
): Promise<void> {
  if (!options.dependencies?.notify) return;

  try {
    await options.dependencies.notify({
      event: reason,
      featureId: options.featureId,
      loopId: options.loopId,
      reason,
      message,
    });
  } catch (error) {
    options.notificationErrors.push(error instanceof Error ? error.message : String(error));
  }
}

async function reviewTurn(params: {
  featureId: string;
  loopId: number;
  turn: InternalTurnResult;
  config: DevLoopConfig;
  selectedVerifier: SelectedLoopTool;
  dependencies: LoopEngineDependencies & { verifier: Pick<IVerifier, 'review'> };
}): Promise<ReviewResult> {
  const request = {
    featureId: params.featureId,
    loopId: params.loopId,
    turn: stripInternalTurn(params.turn),
    config: params.config,
  };
  const diff = await params.dependencies.collectDiff?.(request) ?? '';
  const uncertainTags = await params.dependencies.collectUncertainTags?.(request) ?? [];
  const mcpUsage = await params.dependencies.collectMcpUsage?.(request) ?? [];
  const testFailures = params.turn.testResult.success
    ? []
    : [{
        summary: params.turn.testResult.summary,
        stdout: params.turn.testResult.stdout,
        stderr: params.turn.testResult.stderr,
      }];

  return params.dependencies.verifier.review({
    featureId: params.featureId,
    prompt: diff,
    changedFiles: params.turn.generatedFiles,
    commandsRun: commandList(params.turn.testResult),
    metadata: {
      verifier: params.selectedVerifier,
      diff,
      testFailures,
      uncertainTags,
      mcpUsage,
    },
  });
}

function stripInternalTurn(turn: InternalTurnResult): LoopTurnExecutionResult {
  const { testResult: _testResult, backups: _backups, ...publicTurn } = turn;
  return publicTurn;
}

function commandList(testResult: TestRunResult): string[] {
  return testResult.command
    ? [[testResult.command, ...testResult.args].join(' ')]
    : [];
}

function focusFilesFromFindings(findings: ReviewFinding[]): string[] {
  return Array.from(new Set(findings.map(finding => finding.file).filter((file): file is string => Boolean(file))));
}

function totalNumber(turns: LoopTurnExecutionResult[], key: 'inputTokens' | 'outputTokens' | 'costUsd'): number {
  return turns.reduce((total, turn) => total + turn[key], 0);
}

async function writeGeneratedFiles(params: {
  projectDir: string;
  sandboxDir: string;
  sandboxMode: boolean;
  files: Array<{ path: string; content: string }>;
}): Promise<AppliedFileBackup[]> {
  const baseDir = params.sandboxMode ? params.sandboxDir : params.projectDir;
  const backups: AppliedFileBackup[] = [];

  for (const file of params.files) {
    const resolved = resolveProjectPath(baseDir, file.path);
    try {
      backups.push({ absolutePath: resolved.absolutePath, content: await readFile(resolved.absolutePath, 'utf8') });
    } catch (error) {
      if (!error || typeof error !== 'object' || (error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      backups.push({ absolutePath: resolved.absolutePath });
    }
    await writeFileAtomic(resolved.absolutePath, file.content);
  }
  return backups;
}

async function rollbackAppliedFiles(backups: AppliedFileBackup[]): Promise<void> {
  for (const backup of [...backups].reverse()) {
    if (backup.content === undefined) await rm(backup.absolutePath, { force: true });
    else await writeFileAtomic(backup.absolutePath, backup.content);
  }
}

async function appendBugReport(
  bugsPath: string,
  params: { featureId: string; turnNumber: number; testResult: TestRunResult },
): Promise<void> {
  const current = await readFileSafe(bugsPath);
  const sections = [
    current.trimEnd(),
    '',
    `## ${params.featureId} turn ${params.turnNumber} test failure`,
    '',
    `Summary: ${params.testResult.summary}`,
  ];

  if (params.testResult.stderr.trim()) {
    sections.push('', `stderr:\n${params.testResult.stderr.trimEnd()}`);
  }

  if (params.testResult.stdout.trim()) {
    sections.push('', `stdout:\n${params.testResult.stdout.trimEnd()}`);
  }

  await writeFileAtomic(bugsPath, `${sections.join('\n').trimEnd()}\n`);
}

async function appendVerifierBugs(
  bugsPath: string,
  params: { featureId: string; turnNumber: number; review: ReviewResult },
): Promise<void> {
  const current = await readFileSafe(bugsPath);
  const lines = [
    current.trimEnd(),
    '',
    `## ${params.featureId} turn ${params.turnNumber} verifier bugs`,
    '',
    `Summary: ${params.review.summary}`,
    `confidence: ${params.review.confidenceScore}`,
    '',
    ...params.review.findings.map(formatFinding),
    '',
  ];

  await writeFileAtomic(bugsPath, `${lines.join('\n').trimEnd()}\n`);
}

function formatFinding(finding: ReviewFinding): string {
  const location = finding.file
    ? ` (${finding.file}${finding.line === undefined ? '' : `:${finding.line}`})`
    : '';
  return `- [${finding.severity}]${location} ${finding.message}`;
}
