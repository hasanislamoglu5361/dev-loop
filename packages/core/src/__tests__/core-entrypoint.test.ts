import { describe, expect, it } from 'vitest';

describe('@dev-loop/core public API', () => {
  it('exports a stable entry point', async () => {
    const core = await import('../index.js');

    expect(core).toEqual(expect.objectContaining({
      loadConfig: expect.any(Function),
      saveConfig: expect.any(Function),
      createDefaultConfig: expect.any(Function),
      EventBus: expect.any(Function),
      DevLoopError: expect.any(Function),
      countTokens: expect.any(Function),
      globFiles: expect.any(Function),
      buildProjectRuntimePaths: expect.any(Function),
      initProjectRuntime: expect.any(Function),
      generateCodeMap: expect.any(Function),
      discoverCodeMapSourceFiles: expect.any(Function),
      detectArchitecturalDecisions: expect.any(Function),
      appendDecisionEntries: expect.any(Function),
      extractCodingPatterns: expect.any(Function),
      writePatternsDocument: expect.any(Function),
      indexProjectFiles: expect.any(Function),
      queryRelevantFiles: expect.any(Function),
      saveLoopSummary: expect.any(Function),
      loadLoopSummaries: expect.any(Function),
      optimizeContext: expect.any(Function),
      learnErrorPattern: expect.any(Function),
      buildEvolvedSystemPrompt: expect.any(Function),
      recordSuccessPattern: expect.any(Function),
      updateModelProfile: expect.any(Function),
      buildCalibrationSummary: expect.any(Function),
      getActivePromptVersion: expect.any(Function),
      retirePromptVersion: expect.any(Function),
      recordPromptSample: expect.any(Function),
      exportFineTuneJsonl: expect.any(Function),
      resolvePlanningDependencies: expect.any(Function),
      PlanningDependencyError: expect.any(Function),
      createSplitPlan: expect.any(Function),
      estimatePlanningTask: expect.any(Function),
      planSprints: expect.any(Function),
      runBenchmarks: expect.any(Function),
      buildBenchmarkReport: expect.any(Function),
      formatNotificationMessage: expect.any(Function),
      NotificationDispatcher: expect.any(Function),
      SafeGit: expect.any(Function),
      createGithubPullRequest: expect.any(Function),
      processJiraTickets: expect.any(Function),
      runSecondaryIntegrations: expect.any(Function),
      CheckpointManager: expect.any(Function),
      CheckpointError: expect.any(Function),
      McpManager: expect.any(Function),
      suggestMcpServers: expect.any(Function),
      McpSandbox: expect.any(Function),
      runLoop: expect.any(Function),
      SuccessHookError: expect.any(Function),
      mergeGitignore: expect.any(Function),
      mergeVSCodeSettings: expect.any(Function),
      checkConfigFile: expect.any(Function),
      safeParseWithMessage: expect.any(Function),
      parseGeneratedFiles: expect.any(Function),
      GeneratedFileParseError: expect.any(Function),
      withTimeout: expect.any(Function),
      retryWithBackoff: expect.any(Function),
      runProcess: expect.any(Function),
      ProcessError: expect.any(Function),
      createTestRunner: expect.any(Function),
      parseTestProcessResult: expect.any(Function),
      runTests: expect.any(Function),
      runQualityCheck: expect.any(Function),
      runQualityGate: expect.any(Function),
      parseVulnerabilityOutput: expect.any(Function),
      parseCoverageOutput: expect.any(Function),
      resolveProjectPath: expect.any(Function),
      isPathInsideProject: expect.any(Function),
      PathSafetyError: expect.any(Function),
      redactSecrets: expect.any(Function),
      safeJsonStringify: expect.any(Function),
      isSecretKey: expect.any(Function),
      scanSecrets: expect.any(Function),
      BaseModelProvider: expect.any(Function),
      classifyModelError: expect.any(Function),
      ModelProviderError: expect.any(Function),
      consumeModelStream: expect.any(Function),
      normalizeStreamEvent: expect.any(Function),
      ModelStreamError: expect.any(Function),
      LMStudioProvider: expect.any(Function),
      OllamaProvider: expect.any(Function),
      VramManager: expect.any(Function),
      VramError: expect.any(Function),
      suggestQuantization: expect.any(Function),
      OpenAIProvider: expect.any(Function),
      OpenRouterProvider: expect.any(Function),
      AnthropicProvider: expect.any(Function),
      GoogleProvider: expect.any(Function),
      ModelRegistry: expect.any(Function),
      ModelRegistryError: expect.any(Function),
      AutoModelSelector: expect.any(Function),
      ModelSelectionError: expect.any(Function),
      buildDiffAwareRetryPrompt: expect.any(Function),
      normalizeMcpScore: expect.any(Function),
      normalizeReviewResult: expect.any(Function),
      parseVerifierOutput: expect.any(Function),
      runCliVerifier: expect.any(Function),
      VerifierCliError: expect.any(Function),
      ClaudeCodeCliVerifier: expect.any(Function),
      ClaudeCliVerifier: expect.any(Function),
      buildClaudeReviewPrompt: expect.any(Function),
      ApiVerifier: expect.any(Function),
      CodexCliVerifier: expect.any(Function),
      buildVerifierPrompt: expect.any(Function),
      buildAutoEnrichedSection: expect.any(Function),
      enrichFeatureFile: expect.any(Function),
      analyzeDiffRisk: expect.any(Function),
      parseUnifiedDiff: expect.any(Function),
      detectUncertainInContent: expect.any(Function),
      detectUncertainInFiles: expect.any(Function),
      detectUncertainInPath: expect.any(Function),
      detectPromptInjection: expect.any(Function),
      scanMcpInputForInjection: expect.any(Function),
      scoreMcpUsage: expect.any(Function),
      translateSqlRequestToReport: expect.any(Function),
      resolveApiKey: expect.any(Function),
      selectCheapestOpenRouterModel: expect.any(Function),
      estimateProviderCostUsd: expect.any(Function),
    }));
  });

  it('does not expose raw database internals from the root API', async () => {
    const core = await import('../index.js');

    expect('loopHistory' in core).toBe(false);
    expect('rawQuery' in core).toBe(false);
  });

  it('exposes intended database APIs through the db subpath module', async () => {
    const db = await import('../db/index.js');

    expect(db).toEqual(expect.objectContaining({
      initDatabase: expect.any(Function),
      runMigrations: expect.any(Function),
      createLoop: expect.any(Function),
      getLoopDetail: expect.any(Function),
    }));
  });

  it('exposes intended model provider APIs through the models subpath module', async () => {
    const models = await import('../models/index.js');

    expect(models).toEqual(expect.objectContaining({
      BaseModelProvider: expect.any(Function),
    }));
  });
});
