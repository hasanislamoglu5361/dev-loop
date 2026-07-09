import { describe, expect, it } from 'vitest';
import { getTableColumns, getTableName } from 'drizzle-orm';
import { getTableConfig } from 'drizzle-orm/sqlite-core';
import {
  agentCommunication,
  auditLog,
  benchmarkResults,
  dbQueryAnalysis,
  flakyTests,
  goldenFiles,
  mcpErrors,
  mcpScores,
  mcpUsage,
  notificationLog,
  planningHistory,
  promptVersions,
  qualityHistory,
  tickets,
  uncertainTags,
  userRatings,
} from '../db/schema.js';
import type {
  AgentCommunication,
  AuditLog,
  BenchmarkResult,
  DbQueryAnalysis,
  FlakyTest,
  GoldenFile,
  McpError,
  McpScore,
  McpUsage,
  NewAgentCommunication,
  NewAuditLog,
  NewBenchmarkResult,
  NewDbQueryAnalysis,
  NewFlakyTest,
  NewGoldenFile,
  NewMcpError,
  NewMcpScore,
  NewMcpUsage,
  NewNotificationLog,
  NewPlanningHistory,
  NewPromptVersion,
  NewQualityHistory,
  NewTicket,
  NewUncertainTag,
  NewUserRating,
  NotificationLog,
  PlanningHistory,
  PromptVersion,
  QualityHistory,
  Ticket,
  UncertainTag,
  UserRating,
} from '../db/schema.js';

const remainingTables = [
  [mcpUsage, 'mcp_usage'],
  [mcpErrors, 'mcp_errors'],
  [mcpScores, 'mcp_scores'],
  [benchmarkResults, 'benchmark_results'],
  [qualityHistory, 'quality_history'],
  [uncertainTags, 'uncertain_tags'],
  [promptVersions, 'prompt_versions'],
  [notificationLog, 'notification_log'],
  [tickets, 'tickets'],
  [auditLog, 'audit_log'],
  [planningHistory, 'planning_history'],
  [dbQueryAnalysis, 'db_query_analysis'],
  [userRatings, 'user_ratings'],
  [flakyTests, 'flaky_tests'],
  [goldenFiles, 'golden_files'],
  [agentCommunication, 'agent_communication'],
] as const;

function indexNames(table: Parameters<typeof getTableConfig>[0]): string[] {
  return getTableConfig(table).indexes.map(index => index.config.name).sort();
}

function expectType<T>(value: T): T {
  return value;
}

function timestampColumnName(table: Parameters<typeof getTableColumns>[0]): string {
  const columns = getTableColumns(table) as Record<string, { name: string } | undefined>;
  const timestampColumn = columns.createdAt ?? columns.firstSeen ?? columns.timestamp;
  if (!timestampColumn) {
    throw new Error(`Missing timestamp column on ${getTableName(table)}`);
  }
  return timestampColumn.name;
}

describe('FEATURE022 - Remaining Database Tables', () => {
  it('exports every remaining table with a real SQLite table name', () => {
    for (const [table, tableName] of remainingTables) {
      expect(getTableName(table)).toBe(tableName);
    }
  });

  it('declares important unique indexes in Drizzle metadata', () => {
    expect(indexNames(tickets)).toContain('idx_tickets_provider_ticket_unique');
    expect(indexNames(flakyTests)).toContain('idx_flaky_tests_test_name_unique');
    expect(indexNames(goldenFiles)).toContain('idx_golden_files_file_path_unique');
  });

  it('keeps required timestamp columns on remaining tables', () => {
    for (const table of [
      mcpUsage,
      mcpErrors,
      mcpScores,
      benchmarkResults,
      qualityHistory,
      uncertainTags,
      promptVersions,
      notificationLog,
      tickets,
      auditLog,
      planningHistory,
      dbQueryAnalysis,
      userRatings,
      flakyTests,
      goldenFiles,
    ]) {
      expect(timestampColumnName(table)).toMatch(/^(created_at|first_seen)$/);
    }

    expect(timestampColumnName(agentCommunication)).toBe('timestamp');
  });

  it('exports inferred select and insert types for important remaining rows', () => {
    expectType<NewMcpUsage>({ loopId: 1, mcpServer: 'filesystem', toolName: 'read' });
    expectType<McpUsage>({
      id: 1,
      loopId: 1,
      turnId: null,
      model: null,
      mcpServer: 'filesystem',
      toolName: 'read',
      inputSummary: null,
      outputSummary: null,
      success: 1,
      wasNecessary: null,
      couldHavePreventedError: 0,
      durationMs: null,
      createdAt: '2026-07-10 00:00:00',
    });
    expectType<NewMcpError>({ loopId: 1, mcpServer: 'filesystem', toolName: 'read' });
    expectType<McpError>({
      id: 1,
      loopId: 1,
      turnId: null,
      model: null,
      mcpServer: 'filesystem',
      toolName: 'read',
      errorType: null,
      errorMessage: null,
      inputSummary: null,
      resolved: 0,
      createdAt: '2026-07-10 00:00:00',
    });
    expectType<NewMcpScore>({ loopId: 1 });
    expectType<McpScore>({
      id: 1,
      loopId: 1,
      model: null,
      shouldHaveUsed: null,
      correctlyUsed: null,
      incorrectlyUsed: null,
      webSearchCount: 0,
      webSearchSuccess: 0,
      score: null,
      verifierNotes: null,
      createdAt: '2026-07-10 00:00:00',
    });
    expectType<NewBenchmarkResult>({ benchmarkId: 'bench-1', model: 'model' });
    expectType<BenchmarkResult>({
      id: 1,
      benchmarkId: 'bench-1',
      benchmarkName: null,
      model: 'model',
      provider: null,
      featureSummary: null,
      success: 0,
      turns: null,
      inputTokens: null,
      outputTokens: null,
      costUsd: null,
      durationSeconds: null,
      tokensPerSecond: null,
      vramMb: null,
      quantization: null,
      qualityScore: null,
      testCoveragePct: null,
      mcpScore: null,
      createdAt: '2026-07-10 00:00:00',
    });
    expectType<NewQualityHistory>({ loopId: 1 });
    expectType<QualityHistory>({
      id: 1,
      loopId: 1,
      commitHash: null,
      testCoveragePct: null,
      complexityScore: null,
      typeCoveragePct: null,
      mutationScore: null,
      secretsFound: 0,
      vulnerabilitiesCritical: 0,
      vulnerabilitiesHigh: 0,
      deadCodeCount: 0,
      duplicateCodePct: null,
      techDebtMinutes: null,
      lintErrors: 0,
      gatePassed: 0,
      createdAt: '2026-07-10 00:00:00',
    });
    expectType<NewUncertainTag>({ loopId: 1, filePath: 'src/index.ts' });
    expectType<UncertainTag>({
      id: 1,
      loopId: 1,
      filePath: 'src/index.ts',
      lineNumber: null,
      codeSnippet: null,
      modelNote: null,
      verifierConfirmed: 0,
      resolved: 0,
      resolutionNote: null,
      createdAt: '2026-07-10 00:00:00',
      resolvedAt: null,
    });
    expectType<NewPromptVersion>({ promptType: 'planner', version: '1', content: 'prompt' });
    expectType<PromptVersion>({
      id: 1,
      promptType: 'planner',
      model: null,
      featureType: null,
      version: '1',
      content: 'prompt',
      successRate: null,
      avgTurns: null,
      avgCost: null,
      sampleCount: 0,
      isActive: 1,
      createdAt: '2026-07-10 00:00:00',
      retiredAt: null,
    });
    expectType<NewNotificationLog>({ channel: 'slack', eventType: 'done' });
    expectType<NotificationLog>({
      id: 1,
      channel: 'slack',
      eventType: 'done',
      message: null,
      loopId: null,
      sent: 0,
      errorMessage: null,
      createdAt: '2026-07-10 00:00:00',
    });
    expectType<NewTicket>({ provider: 'jira', ticketId: 'ABC-1' });
    expectType<Ticket>({
      id: 1,
      provider: 'jira',
      ticketId: 'ABC-1',
      title: null,
      description: null,
      status: null,
      linkedFeatureId: null,
      loopId: null,
      commentPosted: 0,
      injectionDetected: 0,
      lastSynced: null,
      createdAt: '2026-07-10 00:00:00',
    });
    expectType<NewAuditLog>({ eventType: 'loop.start' });
    expectType<AuditLog>({
      id: 1,
      eventType: 'loop.start',
      model: null,
      loopId: null,
      featureSummary: null,
      filesChanged: null,
      diffSizeLines: null,
      commitHash: null,
      signature: null,
      createdAt: '2026-07-10 00:00:00',
    });
    expectType<NewPlanningHistory>({ featureId: 'feature-1' });
    expectType<PlanningHistory>({
      id: 1,
      featureId: 'feature-1',
      planningModel: null,
      planVersion: 1,
      taskCount: null,
      estimatedEffortHours: null,
      actualEffortHours: null,
      estimatedCostUsd: null,
      actualCostUsd: null,
      dependencyCount: null,
      riskScore: null,
      planContent: null,
      score: null,
      createdAt: '2026-07-10 00:00:00',
    });
    expectType<NewDbQueryAnalysis>({});
    expectType<DbQueryAnalysis>({
      id: 1,
      loopId: null,
      queryHash: null,
      queryText: null,
      explainOutput: null,
      executionTimeMs: null,
      isSlow: 0,
      optimizationSuggestion: null,
      indexSuggestion: null,
      createdAt: '2026-07-10 00:00:00',
    });
    expectType<NewUserRating>({ loopId: 1, rating: 5 });
    expectType<UserRating>({
      id: 1,
      loopId: 1,
      rating: 5,
      comment: null,
      falsePositive: 0,
      createdAt: '2026-07-10 00:00:00',
    });
    expectType<NewFlakyTest>({ testName: 'test passes sometimes' });
    expectType<FlakyTest>({
      id: 1,
      testName: 'test passes sometimes',
      testFile: null,
      passCount: 0,
      failCount: 0,
      flakyRate: null,
      firstSeen: '2026-07-10 00:00:00',
      lastSeen: '2026-07-10 00:00:00',
      resolved: 0,
      resolvedAt: null,
    });
    expectType<NewGoldenFile>({ filePath: 'snapshot.txt', contentHash: 'hash' });
    expectType<GoldenFile>({
      id: 1,
      filePath: 'snapshot.txt',
      contentHash: 'hash',
      lastVerified: null,
      createdAt: '2026-07-10 00:00:00',
    });
    expectType<NewAgentCommunication>({
      fromAgent: 'planner',
      toAgent: 'coder',
      timestamp: '2026-07-10 00:00:00',
    });
    expectType<AgentCommunication>({
      id: 1,
      fromAgent: 'planner',
      toAgent: 'coder',
      instruction: null,
      context: null,
      resultSummary: null,
      success: null,
      timestamp: '2026-07-10 00:00:00',
    });
  });
});
