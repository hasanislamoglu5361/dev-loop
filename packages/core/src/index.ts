export {
  loadConfig,
  saveConfig,
  createDefaultConfig,
  applyEnvOverrides,
  mergeDefaults,
} from './config/loader.js';
export type { ConfigWarning, LoadConfigOptions } from './config/loader.js';
export type { DevLoopConfig } from './config/schema.js';
export { CONFIG_SECTION_CONSUMERS, getConfigConsumers } from './config/consumers.js';
export type { ConfigConsumer, ConfigSection } from './config/consumers.js';

export { checkConfigFile, safeParseWithMessage } from './config/errors.js';
export type { ConfigCheckResult, SafeParseResult } from './config/errors.js';

export {
  DevLoopError,
  ConfigError,
  DatabaseError,
  ModelError,
  VerifierError,
  PlanningError,
  MigrationAbortedError,
} from './errors.js';

export { EventBus } from './events.js';
export type { EventName, EventPayloadMap, Listener } from './events.js';

export type {
  LoopId,
  StepId,
  LoopStep,
  LoopDef,
  ModelProviderName,
  ModelRef,
  ModelConfig,
  VerifierConfig,
  MCPServerConfig,
  QualityGate,
  PlanningConfig,
  NotificationConfig,
  GeneratedFile,
  LoopResult,
} from './types.js';

export { BaseModelProvider } from './models/index.js';
export {
  classifyModelError,
  consumeModelStream,
  LMStudioProvider,
  OllamaProvider,
  OpenAIProvider,
  OpenRouterProvider,
  AnthropicProvider,
  GoogleProvider,
  ModelRegistry,
  ModelRegistryError,
  AutoModelSelector,
  ModelSelectionError,
  buildDiffAwareRetryPrompt,
  ModelProviderError,
  ModelStreamError,
  normalizeStreamEvent,
  suggestQuantization,
  VramError,
  VramManager,
  resolveApiKey,
  selectCheapestOpenRouterModel,
  estimateProviderCostUsd,
  normalizeMcpScore,
  normalizeReviewResult,
  parseVerifierOutput,
  runCliVerifier,
  VerifierCliError,
  ClaudeCodeCliVerifier,
  ClaudeCliVerifier,
  buildClaudeReviewPrompt,
  ApiVerifier,
  CodexCliVerifier,
  createVerifier,
  buildVerifierPrompt,
  buildAutoEnrichedSection,
  enrichFeatureFile,
  analyzeDiffRisk,
  parseUnifiedDiff,
  detectUncertainInContent,
  detectUncertainInFiles,
  detectUncertainInPath,
  detectPromptInjection,
  scanMcpInputForInjection,
  scoreMcpUsage,
  translateSqlRequestToReport,
} from './models/index.js';
export type {
  BaseModelProviderOptions,
  ClassifiedModelError,
  ConsumedModelStream,
  ConsumeModelStreamOptions,
  CreateHealthCheckOptions,
  GenerateFinishReason,
  GenerateParams,
  GenerateResult,
  FetchInit,
  FetchLike,
  LMStudioProviderOptions,
  LMStudioSessionState,
  OllamaFetchInit,
  OllamaFetchLike,
  OllamaProviderOptions,
  AssertCanLoadOptions,
  ModelLoadLockOptions,
  QuantizationSuggestionOptions,
  VramCommandResult,
  VramCommandRunner,
  VramInfo,
  VramManagerOptions,
  VramPlatform,
  OpenAICompatibleFetch,
  OpenAICompatibleFetchInit,
  OpenAIProviderOptions,
  OpenRouterModel,
  OpenRouterModelFilter,
  OpenRouterProviderOptions,
  AnthropicClientLike,
  AnthropicMessageCreateInput,
  AnthropicMessageResponse,
  AnthropicProviderOptions,
  GoogleClientLike,
  GoogleGenerateContentInput,
  GoogleGenerateContentResponse,
  GoogleProviderOptions,
  RegisteredModel,
  ResolvedModel,
  AutoModelSelectorOptions,
  ModelSelection,
  RepeatedFailureContext,
  RepeatedFailureSelection,
  SelectModelContext,
  SelectorCandidate,
  DiffAwareRetryPromptOptions,
  RetryPromptBug,
  RetryPromptSemanticAnalysis,
  IVerifier,
  McpScore,
  McpScoreInput,
  RawPlan,
  RawPlanStep,
  ReviewFinding,
  ReviewParams,
  ReviewResult,
  ReviewResultInput,
  ReviewStatus,
  SandboxApproval,
  CliVerifierRunOptions,
  ClaudeCliVerifierOptions,
  ClaudeReviewParams,
  McpUsageSummary,
  ApiVerifierOptions,
  CodexCliVerifierOptions,
  VerifierFactoryConfig,
  SqlReportTranslation,
  VerifierPromptParams,
  EnrichFeatureFileOptions,
  EnrichmentEffortEstimate,
  KnownErrorPattern,
  DiffRiskAnalysis,
  ParsedDiffFile,
  ParsedDiffHunk,
  ParsedUnifiedDiff,
  UncertainDetectionOptions,
  UncertainTag,
  InjectionDetectionResult,
  InjectionIssue,
  InjectionIssueKind,
  InjectionScanOptions,
  InjectionSeverity,
  McpIncorrectUse,
  McpUsageRecord,
  McpUsageScoreInput,
  McpUsageScoreResult,
  McpWebSearchStats,
  ModelGeneratedFile,
  ModelInfo,
  ModelInputFile,
  ModelMessage,
  ModelMessageRole,
  ModelProvider,
  ModelErrorContext,
  ModelErrorKind,
  ModelErrorResolution,
  ModelProviderId,
  ModelStreamEvent,
  ProviderHealth,
  ProviderHealthStatus,
} from './models/index.js';

export {
  CostTracker,
  calculateCallCost,
  estimateCost,
  estimateLoopCost,
} from './utils/cost-calculator.js';
export type { CostBreakdown, CostTrackerOptions } from './utils/cost-calculator.js';

export {
  ensureDir,
  globFiles,
  moveFileAtomic,
  pathExists,
  readFileSafe,
  writeFileAtomic,
} from './utils/file-system.js';
export type { GlobOptions } from './utils/file-system.js';

export {
  GeneratedFileParseError,
  parseGeneratedFiles,
} from './utils/generated-files.js';
export type { ParsedGeneratedFiles } from './utils/generated-files.js';

export {
  ProcessError,
  retryWithBackoff,
  runProcess,
  withTimeout,
} from './utils/process.js';
export type {
  ProcessResult,
  ProcessRunOptions,
  RetryInfo,
  RetryOptions,
  SpawnLike,
  TimeoutOptions,
} from './utils/process.js';

export {
  createTestRunner,
  parseTestProcessResult,
  runTests,
} from './runtime/test-runner.js';
export type {
  TestOutputParseInput,
  TestRunRequest,
  TestRunResult,
  TestRunStatus,
  TestRunner,
  TestRunnerConfig,
  TestRunnerOptions,
  TestRunnerType,
} from './runtime/test-runner.js';

export {
  parseCoverageOutput,
  parseVulnerabilityOutput,
  runQualityCheck,
  runQualityGate,
} from './runtime/quality-checks.js';
export { measureCyclomaticComplexity, measureProjectComplexity } from './runtime/complexity.js';
export type { ComplexityMeasurement } from './runtime/complexity.js';
export type {
  CoverageSummary,
  QualityChecker,
  QualityCheckerContext,
  QualityCheckConfig,
  QualityCheckKind,
  QualityCheckRequest,
  QualityCheckResult,
  QualityCheckStatus,
  QualityGateFailure,
  QualityGateNotification,
  QualityGateRequest,
  QualityGateResult,
  QualityGateThresholds,
  QualityGateTrendRecord,
  QualityMetrics,
  VulnerabilitySummary,
} from './runtime/quality-checks.js';

export {
  isPathInsideProject,
  PathSafetyError,
  resolveProjectPath,
} from './utils/path-safety.js';
export type {
  ResolvedProjectPath,
  ResolveProjectPathOptions,
} from './utils/path-safety.js';

export {
  isSecretKey,
  REDACTED,
  redactSecrets,
  safeJsonStringify,
} from './utils/redaction.js';

export { scanSecrets } from './utils/secret-scanner.js';
export type {
  SecretFinding,
  SecretKind,
  SecretScanOptions,
  SecretScanResult,
} from './utils/secret-scanner.js';

export {
  canFitInBudget,
  countFileTokens,
  countFilesTokens,
  countTokens,
  countChatTokens,
  countTokensHeuristic,
  estimateTokensFromChars,
  getTokenRatio,
  truncateToTokenBudget,
} from './utils/token-counter.js';

export {
  buildProjectRuntimePaths,
  initProjectRuntime,
} from './context/init-runtime.js';
export type { InitResult } from './context/init-runtime.js';

export { discoverCodeMapSourceFiles, generateCodeMap } from './context/code-map.js';
export type {
  CodeMapFileInfo,
  GenerateCodeMapOptions,
  GenerateCodeMapResult,
} from './context/code-map.js';

export {
  appendDecisionEntries,
  detectArchitecturalDecisions,
  extractCodingPatterns,
  writePatternsDocument,
} from './context/knowledge-docs.js';
export type {
  AppendDecisionEntriesOptions,
  CodingPattern,
  DecisionEntry,
  ExtractCodingPatternsOptions,
  KnowledgeDocumentWriteResult,
  LoopDecisionEvidence,
  WritePatternsDocumentOptions,
} from './context/knowledge-docs.js';

export { indexProjectFiles, queryRelevantFiles } from './context/semantic-search.js';
export type {
  IndexProjectFilesOptions,
  QueryRelevantFilesOptions,
  RelevantFileResult,
  SearchIndex,
  SearchIndexFile,
  SemanticSearchVectorizer,
} from './context/semantic-search.js';

export { loadLoopSummaries, saveLoopSummary } from './context/memory.js';
export type {
  LoadLoopSummariesOptions,
  LoopMemorySummary,
  SaveLoopSummaryOptions,
} from './context/memory.js';

export { optimizeContext } from './context/optimizer.js';
export type {
  OptimizedContextResult,
  OptimizedContextSection,
  OptimizedContextSectionType,
  OptimizeContextOptions,
  OptimizerRelevantFile,
} from './context/optimizer.js';

export { buildEvolvedSystemPrompt, learnErrorPattern } from './context/error-patterns.js';
export type {
  BuildEvolvedSystemPromptOptions,
  ErrorPatternBug,
  ErrorPatternVersion,
  LearnedErrorPattern,
  LearnErrorPatternOptions,
  LearnErrorPatternResult,
} from './context/error-patterns.js';

export {
  buildCalibrationSummary,
  recordSuccessPattern,
  updateModelProfile,
} from './context/calibration.js';
export type {
  LoopPerformanceRecord,
  ModelCalibrationProfile,
  SuccessPatternRecord,
} from './context/calibration.js';

export {
  exportFineTuneJsonl,
  getActivePromptVersion,
  recordPromptSample,
  retirePromptVersion,
} from './context/prompt-evolution.js';
export type {
  ExportFineTuneJsonlOptions,
  ExportFineTuneJsonlResult,
  FineTuneLoopRecord,
  FineTuneMessage,
  PromptVersionRecord,
  RecordPromptSampleOptions,
} from './context/prompt-evolution.js';

export { PlanningDependencyError, resolvePlanningDependencies } from './planning/dependency.js';
export type { PlanTask } from './planning/dependency.js';

export { createSplitPlan } from './planning/task-splitter.js';
export type {
  CreateSplitPlanOptions,
  CreateSplitPlanResult,
  PlanningTaskVerifier,
  SplitPlanTask,
} from './planning/task-splitter.js';

export { estimatePlanningTask, planSprints } from './planning/effort.js';
export type {
  EffortHistoryRecord,
  EstimatePlanningTaskOptions,
  PlanningEstimateTask,
  PlanningTaskEstimate,
  PlanSprintsOptions,
  SprintPlan,
  SprintTask,
} from './planning/effort.js';

export { runBenchmarks } from './benchmark/runner.js';
export type {
  BenchmarkLoopResult,
  BenchmarkModel,
  BenchmarkResult,
  BenchmarkStatus,
  BenchmarkVramManager,
  RunBenchmarksOptions,
  RunBenchmarksResult,
} from './benchmark/runner.js';

export { buildBenchmarkReport } from './benchmark/report.js';
export type {
  BenchmarkReport,
  BenchmarkReportInput,
  BenchmarkReportRow,
} from './benchmark/report.js';

export { formatNotificationMessage } from './notifications/format.js';
export type {
  NotificationEventType,
  NotificationFormatInput,
} from './notifications/format.js';

export { NotificationDispatcher } from './notifications/dispatcher.js';
export type {
  NotificationChannelConfig,
  NotificationChannelName,
  NotificationClient,
  NotificationDispatcherOptions,
  NotificationDispatcherResult,
  NotificationDispatchEvent,
  NotificationDispatchResult,
  NotificationDispatchStatus,
  NotificationLogEntry,
} from './notifications/dispatcher.js';

export {
  cronToIntervalMs,
  getChannelsForEvent,
  sendToChannel,
  startDigest,
  stopDigest,
} from './notifications/channels.js';
export {
  buildChannelConfigs,
  createDesktopClient,
  createEmailClient,
  createSlackClient,
  createSoundClient,
  createTelegramClient,
} from './notifications/adapters.js';
export type {
  ChannelConfigMap,
  ChannelName,
  DesktopChannelConfig,
  EmailChannelConfig,
  SlackChannelConfig,
  SoundChannelConfig,
  TelegramChannelConfig,
} from './notifications/channels.js';

export { SafeGit } from './git/safe-git.js';
export type {
  SafeGitCommitOptions,
  SafeGitCommitResult,
  SafeGitOptions,
  SafeGitRollbackOptions,
  SafeGitRollbackResult,
  SimpleGitLike,
} from './git/safe-git.js';

export { createGithubPullRequest, processJiraTickets } from './integrations/github-jira.js';
export type {
  CreateGithubPullRequestOptions,
  CreateGithubPullRequestResult,
  GithubClient,
  JiraClient,
  JiraTicket,
  ProcessJiraTicketsOptions,
  ProcessJiraTicketsResult,
} from './integrations/github-jira.js';

export { runSecondaryIntegrations } from './integrations/secondary.js';
export type {
  CalendarClient,
  CalendarIntegrationConfig,
  LinearClient,
  LinearIntegrationConfig,
  NotionClient,
  NotionIntegrationConfig,
  ObsidianClient,
  ObsidianIntegrationConfig,
  PostmanClient,
  PostmanIntegrationConfig,
  PostmanSmokeResult,
  RunSecondaryIntegrationsOptions,
  RunSecondaryIntegrationsResult,
  SecondaryIntegrationName,
  SecondaryIntegrationPayload,
  SecondaryIntegrationResult,
  SecondaryIntegrationStatus,
} from './integrations/secondary.js';

export { CheckpointError, CheckpointManager } from './runtime/checkpoints.js';
export type { CheckpointManagerOptions, CheckpointRecord } from './runtime/checkpoints.js';

export { McpManager, suggestMcpServers } from './runtime/mcp-manager.js';
export type {
  McpManagerEvent,
  McpManagerLogEntry,
  McpManagerOptions,
  McpServerConfig,
  McpStartResult,
} from './runtime/mcp-manager.js';

export { McpSandbox } from './runtime/mcp-sandbox.js';
export type {
  McpSandboxOptions,
  SandboxDiffFile,
  SandboxDiffResult,
  SandboxDiffStatus,
  SandboxGeneratedFile,
  SandboxWriteResult,
} from './runtime/mcp-sandbox.js';

export { findLatestResumableLoop, replayLoop, resumeLoop, runLoop, SuccessHookError } from './runtime/engine.js';
export type {
  BuildLoopContextRequest,
  FallbackContextRequest,
  GenerateLoopTurnRequest,
  LoopGenerationResult,
  LoopCheckpointState,
  LoopEngineDependencies,
  LoopSuccessHook,
  LoopSuccessHookContext,
  LoopSuccessHooks,
  LoopTimeTracker,
  LoopTurnExecutionResult,
  RunLoopInitializationResult,
  RunLoopOptions,
  ResumeLoopOptions,
  ReplayLoopOptions,
  ReplayDryRunResult,
  SelectedLoopTool,
} from './runtime/engine.js';

export { composeProductionRuntime } from './runtime/composer.js';
export type { RuntimeComposerOptions, RuntimeComposerResult } from './runtime/composer.js';

export { boundedProvider } from './runtime/bounded-provider.js';
export type { BoundedProvider, BoundedProviderOptions } from './runtime/bounded-provider.js';

export { assessFlakyTests, orderRelatedTests, runTestIntelligence } from './runtime/test-intelligence.js';
export type {
  FlakyAssessment,
  FlakyObservation,
  GoldenFileExpectation,
  IntelligenceStatus,
  MutationConfig,
  TestIntelligenceRequest,
  TestIntelligenceResult,
} from './runtime/test-intelligence.js';

export {
  DEV_LOOP_GITIGNORE_PATTERNS,
  DEV_LOOP_VSCODE_FILES_EXCLUDE,
  DEV_LOOP_VSCODE_SEARCH_EXCLUDE,
  mergeGitignore,
  mergeVSCodeSettings,
} from './context/init-editor-support.js';
