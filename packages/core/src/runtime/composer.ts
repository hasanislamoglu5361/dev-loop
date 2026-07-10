import type { DevLoopConfig } from '../config/schema.js';
import type { LoopEngineDependencies, LoopSuccessHooks, SelectedLoopTool } from './engine.js';
import { CostTracker } from '../utils/cost-calculator.js';
import { CheckpointManager } from './checkpoints.js';
import { ModelRegistry } from '../models/registry.js';
import type { ModelProvider } from '../models/types.js';
import { LMStudioProvider } from '../models/lmstudio.js';
import { OllamaProvider } from '../models/ollama.js';
import { OpenAIProvider } from '../models/providers/openai.js';
import { OpenRouterProvider } from '../models/providers/openrouter.js';
import { AnthropicProvider } from '../models/providers/anthropic.js';
import { createVerifier } from '../models/verifier/factory.js';
import { PolicyVerifier } from '../models/verifier/policy.js';
import { createTestRunner } from './test-runner.js';
import { generateCodeMap } from '../context/code-map.js';
import { runProcess } from '../utils/process.js';
import { closeDatabase, initDatabase } from '../db/connection.js';
import { runQualityGate } from './quality-checks.js';
import type { QualityCheckConfig, QualityChecker, QualityCheckResult } from './quality-checks.js';
import { scanSecrets } from '../utils/secret-scanner.js';
import { detectUncertainInPath } from '../models/verifier/uncertain.js';
import { measureProjectComplexity } from './complexity.js';
import { getLearningContext, getMcpScores, recordVerifiedLearning, saveQualityHistory } from '../db/queries/index.js';
import { boundedProvider, type BoundedProvider } from './bounded-provider.js';

export interface RuntimeComposerOptions {
  projectDir: string;
  config: DevLoopConfig;
  checkpointDir: string;
  dbPath: string;
  /** Optional override for providers used by the composer (otherwise it builds
   *  adapters based on `config.coding.primary.provider`). Every provider ends
   *  up wrapped in a `boundedProvider` so the produced runtime always enforces
   *  hard timeouts on network calls. */
  providers?: ModelProvider[];
  /** Optional per-call timeout override for the production adapters. */
  providerTimeoutMs?: number;
}

export interface RuntimeComposerResult {
  dependencies: LoopEngineDependencies;
  selectedModel: SelectedLoopTool;
  selectedVerifier: SelectedLoopTool;
  checkpointManager: CheckpointManager;
  successHooks: LoopSuccessHooks;
  cost: CostTracker;
  cleanup: () => Promise<void>;
  /** Bounded adapters the runtime owns; tests can introspect generation counts. */
  boundedProviders: BoundedProvider[];
}

function buildContextFromRequest(r: { featureId: string; loopId: number; turn: number; config: DevLoopConfig; bugs: unknown[]; focusFiles: string[] }, projectDir: string, learning: string[] = []): string {
  return [
    '# Loop ' + r.loopId + ' Turn ' + r.turn,
    'Feature: ' + r.featureId,
    'Project: ' + projectDir,
    'Bugs: ' + r.bugs.length,
    'Files: ' + r.focusFiles.join(','),
    ...(learning.length ? ['Learned outcomes:', ...learning.map(item => `- ${item}`)] : []),
  ].join('\n');
}

function buildFallbackFromRequest(r: { featureId: string; loopId: number; bugs: unknown[]; source: string; patterns: string[]; mcpUsage: unknown[]; config: DevLoopConfig }, projectDir: string): string {
  return ['# Fallback ' + r.loopId, 'Feature: ' + r.featureId, 'Project: ' + projectDir, 'Bugs: ' + r.bugs.length, 'Source len: ' + r.source.length].join('\n');
}

export async function composeProductionRuntime(options: RuntimeComposerOptions): Promise<RuntimeComposerResult> {
  const { config, projectDir, checkpointDir } = options;
  initDatabase(options.dbPath);
  const registry = new ModelRegistry();
  const rawProviders = options.providers ?? createConfiguredProviders(config);
  // Wrap every provider with a bounded adapter so the runtime cannot leak
  // unbounded network calls to LM Studio / Ollama / OpenAI / Anthropic / etc.
  // The composer owns these adapters and exposes them on the result so callers
  // can inspect usage and so the cleanup hook can dispose them deterministically.
  const bounded = rawProviders.map(provider => boundedProvider(provider, {
    timeoutMs: options.providerTimeoutMs,
  }));
  bounded.forEach(provider => registry.register(provider));
  const selected = await selectConfiguredModel(config, bounded);
  const codingProvider = selected.provider;
  const codingModel = selected.model;
  const verifierProvider = config.verifier?.provider ?? 'claude-code-cli';
  const verifierModel = config.verifier?.model ?? 'claude-sonnet-4-6';

  const selectedModel: SelectedLoopTool = { provider: codingProvider, model: codingModel };
  const selectedVerifier: SelectedLoopTool = { provider: verifierProvider, model: verifierModel };

  const checkpointManager = new CheckpointManager({ checkpointDir });
  const cost = new CostTracker();
  const provider = registry.getProvider(codingProvider);
  const verifier = createConfiguredVerifier(config, provider, codingModel, options.checkpointDir, projectDir);

  const dependencies: LoopEngineDependencies = {
    selectModel: async () => selectedModel,
    selectVerifier: async () => selectedVerifier,
    buildContext: async (r) => buildContextFromRequest(r, projectDir, getLearningContext(codingModel, r.featureId)),
    generate: async (r) => provider.generate({
      model: r.model.model,
      messages: [{ role: 'user', content: r.context }],
      temperature: r.config.coding.primary.temperature,
      maxTokens: r.config.coding.primary.max_tokens,
    }),
    testRunner: createTestRunner(),
    verifier,
    buildFallbackContext: async (r) => buildFallbackFromRequest(r, projectDir),
    fallbackGenerate: async (r) => provider.generate({ model: r.model.model, messages: [{ role: 'user', content: r.context }] }),
    fallbackVerifier: verifier,
    collectDiff: async () => {
      try {
        return (await runProcess('git', ['diff', '--no-ext-diff'], { cwd: projectDir, timeoutMs: 30_000 })).stdout;
      } catch {
        return '';
      }
    },
    collectUncertainTags: async () => [],
    collectMcpUsage: async () => [],
    collectSource: async () => '',
    collectPatterns: async () => [],
    qualityGate: async request => {
      const result = await runQualityGate({
        projectDir,
        checks: productionQualityChecks(config),
        thresholds: {
          coverage: config.quality_gate.checks.test_coverage_min || undefined,
          complexityMax: config.quality_gate.checks.complexity_max || undefined,
          typeCoverage: config.quality_gate.checks.type_coverage_min || undefined,
          mcpScore: config.quality_gate.checks.mcp_score_min || undefined,
        },
        blockCommitOnFailure: config.quality_gate.block_commit_on_failure,
        checkers: productionQualityCheckers(projectDir, request.loopId),
        saveTrend: async trend => {
          await saveQualityHistory(request.loopId, {
            testCoveragePct: trend.testCoveragePct,
            complexityScore: trend.complexityScore,
            typeCoveragePct: trend.typeCoveragePct,
            secretsFound: trend.secretsFound,
            vulnerabilitiesCritical: trend.vulnerabilitiesCritical,
            vulnerabilitiesHigh: trend.vulnerabilitiesHigh,
            lintErrors: trend.lintErrors,
            mcpScore: trend.mcpScore,
            gatePassed: trend.gatePassed,
          });
        },
      });
      return { success: result.success, blockCommit: result.blockCommit, summary: result.failures.map(failure => failure.reason).join('; ') };
    },
  };

  const successHooks: LoopSuccessHooks = {
    updateCodeMap: async () => { await generateCodeMap({ projectDir }); },
    recordLearning: async context => {
      recordVerifiedLearning({
        loopId: context.loopId,
        model: codingModel,
        provider: codingProvider,
        featureId: context.featureId,
        turns: context.turns.length,
        fallbackUsed: context.fallbackUsed,
      });
    },
  };
  dependencies.successHooks = successHooks;

  const cleanup = async (): Promise<void> => {
    cost.reset();
    await Promise.all(bounded.map(provider => provider.dispose()).concat(Promise.resolve()));
    closeDatabase();
  };

  return {
    dependencies,
    selectedModel,
    selectedVerifier,
    checkpointManager,
    successHooks,
    cost,
    cleanup,
    boundedProviders: bounded,
  };
}

function productionQualityChecks(config: DevLoopConfig): QualityCheckConfig[] {
  const checks: QualityCheckConfig[] = [];
  const configured = config.quality_gate.checks;
  if (configured.vulnerabilities) checks.push({ kind: 'vulnerability', command: 'npm', args: ['audit', '--json'] });
  if (configured.test_coverage_min > 0) checks.push({ kind: 'coverage', command: 'npm', args: ['test', '--', '--coverage'] });
  if (configured.complexity_max > 0) checks.push({ kind: 'complexity' });
  if (configured.lint) checks.push({ kind: 'lint', command: 'npm', args: ['run', 'lint'] });
  checks.push(configured.type_coverage_min > 0
    ? { kind: 'typecheck', command: 'npx', args: ['--no-install', 'type-coverage', '--detail', '--at-least', String(configured.type_coverage_min)] }
    : { kind: 'typecheck', command: 'npm', args: ['run', 'typecheck'] });
  if (configured.secrets) checks.push({ kind: 'secrets' });
  if (configured.uncertain_tags) checks.push({ kind: 'uncertain' });
  if (configured.mcp_score_min > 0) checks.push({ kind: 'mcp' });
  return checks;
}

function productionQualityCheckers(projectDir: string, loopId: number): Partial<Record<QualityCheckConfig['kind'], QualityChecker>> {
  return {
    secrets: async context => {
      const result = await scanSecrets({ projectDir });
      return composedQualityResult(context.check, !result.blocked, `${result.findings.length} secret(s) found.`, { secretsFound: result.findings.length });
    },
    uncertain: async context => {
      const tags = await detectUncertainInPath(projectDir);
      return composedQualityResult(context.check, tags.length === 0, `${tags.length} uncertain tag(s) found.`, { uncertainTags: tags.length });
    },
    complexity: async context => {
      const result = await measureProjectComplexity(projectDir);
      return composedQualityResult(context.check, true, `Maximum complexity: ${result.maximum}.`, { complexityScore: result.maximum });
    },
    mcp: async context => {
      const scoreRow = (await getMcpScores({ loopId }))[0];
      const score = typeof scoreRow?.score === 'number' ? scoreRow.score : 0;
      return composedQualityResult(context.check, true, `MCP score: ${score}.`, { mcpScore: score });
    },
  };
}

function composedQualityResult(check: QualityCheckConfig, success: boolean, summary: string, metrics: NonNullable<QualityCheckResult['metrics']>): QualityCheckResult {
  return { kind: check.kind, enabled: true, success, status: success ? 'passed' : 'failed', args: [], exitCode: success ? 0 : 1, stdout: '', stderr: '', summary, metrics };
}

function createConfiguredVerifier(
  config: DevLoopConfig,
  provider: ModelProvider,
  model: string,
  checkpointDir: string,
  projectDir: string,
) {
  const primary = createVerifierAdapter(config.verifier.provider, provider, model, checkpointDir, projectDir);
  const rotations = config.verifier.rotation.enabled
    ? config.verifier.rotation.verifiers.flatMap((entry: unknown) => {
        const kind = typeof entry === 'string' ? entry : (entry as { provider?: unknown })?.provider;
        return typeof kind === 'string' && ['api', 'claude-cli', 'codex-cli', 'claude-code-cli'].includes(kind)
          ? [createVerifierAdapter(kind, provider, model, checkpointDir, projectDir)]
          : [];
      })
    : [];
  if (rotations.length === 0 && !config.verifier.parallel.enabled) return primary;
  return new PolicyVerifier({
    verifiers: [primary, ...rotations],
    strategy: config.verifier.rotation.strategy === 'best-score' ? 'best-score' : 'round-robin',
    parallel: config.verifier.parallel.enabled,
    requireAllPass: config.verifier.parallel.require_all_pass,
    confidenceThreshold: config.verifier.confidence_score.notify_below,
  });
}

function createVerifierAdapter(kind: string, provider: ModelProvider, model: string, checkpointDir: string, projectDir: string) {
  if (kind === 'api') return createVerifier({ kind: 'api-verifier', options: { provider, model } });
  const options = { promptFile: `${checkpointDir}/verifier-prompt.md`, bugsFile: `${projectDir}/.dev-loop/BUGS.md` };
  if (kind === 'claude-cli') return createVerifier({ kind: 'claude-cli', options });
  if (kind === 'codex-cli') return createVerifier({ kind: 'codex-cli', options });
  return createVerifier({ kind: 'claude-code-cli', options });
}

function createConfiguredProviders(config: DevLoopConfig): ModelProvider[] {
  const kind = config.coding.primary.provider;
  const apiKey = config.coding.primary.api_key;
  if (kind === 'lmstudio') return [new LMStudioProvider({ baseUrl: process.env.DEV_LOOP_LMSTUDIO_URL })];
  if (kind === 'ollama') return [new OllamaProvider({ baseUrl: process.env.DEV_LOOP_OLLAMA_URL })];
  if (kind === 'openai') return [new OpenAIProvider({ apiKey })];
  if (kind === 'openrouter') return [new OpenRouterProvider({ apiKey })];
  if (kind === 'anthropic') return [new AnthropicProvider({ apiKey })];
  return [
    new LMStudioProvider({ baseUrl: process.env.DEV_LOOP_LMSTUDIO_URL }),
    new OllamaProvider({ baseUrl: process.env.DEV_LOOP_OLLAMA_URL }),
  ];
}

async function selectConfiguredModel(config: DevLoopConfig, providers: ModelProvider[]): Promise<SelectedLoopTool> {
  const configuredProvider = config.coding.primary.provider;
  const configuredModel = config.coding.primary.model;
  if (configuredProvider !== 'auto' && configuredModel !== 'auto') {
    if (!providers.some(provider => provider.id === configuredProvider)) {
      throw new Error(`Configured provider ${configuredProvider} is unavailable.`);
    }
    return { provider: configuredProvider, model: configuredModel };
  }
  for (const provider of providers) {
    try {
      const models = await provider.listModels();
      const model = models[0];
      if (model) return { provider: provider.id, model: model.id };
    } catch {
      // Try the next configured provider; the final error remains actionable.
    }
  }
  throw new Error('Automatic model selection found no healthy model. Start LM Studio/Ollama or configure an explicit provider/model.');
}

export type { LoopEngineDependencies, LoopSuccessHooks };
