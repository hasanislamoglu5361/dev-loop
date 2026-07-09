// packages/core/src/db/schema.ts
// Drizzle ORM schema definition for dev-loop SQLite database.

import { sql } from 'drizzle-orm';
import { integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';

const createdAt = () => text('created_at').notNull().default(sql`(datetime('now'))`);

export const loopHistory = sqliteTable('loop_history', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  featureId: text('feature_id'),
  featureSummary: text('feature_summary'),
  featureKeywords: text('feature_keywords'),
  featureType: text('feature_type'),
  language: text('language'),
  primaryModel: text('primary_model'),
  primaryProvider: text('primary_provider'),
  verifierModel: text('verifier_model'),
  verifierProvider: text('verifier_provider'),
  fallbackUsed: integer('fallback_used').default(0),
  fallbackModel: text('fallback_model'),
  totalTurns: integer('total_turns').default(0),
  success: integer('success').default(0),
  failureReason: text('failure_reason'),
  durationSeconds: real('duration_seconds'),
  totalInputTokens: integer('total_input_tokens').default(0),
  totalOutputTokens: integer('total_output_tokens').default(0),
  totalCostUsd: real('total_cost_usd').default(0),
  commitHash: text('commit_hash'),
  branchName: text('branch_name'),
  prUrl: text('pr_url'),
  qualityGatePassed: integer('quality_gate_passed').default(0),
  testCoveragePct: real('test_coverage_pct'),
  uncertainTagsFound: integer('uncertain_tags_found').default(0),
  uncertainTagsResolved: integer('uncertain_tags_resolved').default(0),
  userRating: integer('user_rating'),
  planningLoopId: integer('planning_loop_id'),
  createdAt: createdAt(),
  completedAt: text('completed_at'),
});

export const loopTurns = sqliteTable('loop_turns', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  loopId: integer('loop_id').notNull(),
  turnNumber: integer('turn_number').notNull(),
  agent: text('agent').notNull(),
  model: text('model'),
  inputTokens: integer('input_tokens'),
  outputTokens: integer('output_tokens'),
  costUsd: real('cost_usd'),
  durationSeconds: real('duration_seconds'),
  success: integer('success').default(0),
  errorMessage: text('error_message'),
  errorType: text('error_type'),
  diffSizeLines: integer('diff_size_lines'),
  filesChanged: text('files_changed'),
  uncertainTagsAdded: integer('uncertain_tags_added').default(0),
  mcpServersUsed: text('mcp_servers_used'),
  createdAt: createdAt(),
});

export const errorPatterns = sqliteTable('error_patterns', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  patternHash: text('pattern_hash').notNull().unique(),
  model: text('model').notNull(),
  provider: text('provider'),
  featureKeywords: text('feature_keywords').notNull(),
  language: text('language'),
  errorDescription: text('error_description').notNull(),
  errorCategory: text('error_category'),
  fixDescription: text('fix_description').notNull(),
  fixExample: text('fix_example'),
  versionContext: text('version_context'),
  versionHistory: text('version_history'),
  seenCount: integer('seen_count').default(1),
  firstSeen: text('first_seen').notNull().default(sql`(datetime('now'))`),
  lastSeen: text('last_seen').notNull().default(sql`(datetime('now'))`),
  lastUpdated: text('last_updated'),
  autoInject: integer('auto_inject').default(1),
  conflictingPatternId: integer('conflicting_pattern_id'),
});

export const successPatterns = sqliteTable('success_patterns', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  model: text('model').notNull(),
  provider: text('provider'),
  featureKeywords: text('feature_keywords').notNull(),
  language: text('language'),
  featureType: text('feature_type'),
  successDescription: text('success_description'),
  turnsToComplete: integer('turns_to_complete'),
  promptVersion: text('prompt_version'),
  mcpUsed: text('mcp_used'),
  seenCount: integer('seen_count').default(1),
  firstSeen: text('first_seen').notNull().default(sql`(datetime('now'))`),
  lastSeen: text('last_seen').notNull().default(sql`(datetime('now'))`),
});

export const modelProfiles = sqliteTable('model_profiles', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  model: text('model').notNull(),
  provider: text('provider').notNull(),
  featureType: text('feature_type'),
  language: text('language'),
  hourOfDay: integer('hour_of_day'),
  dayOfWeek: integer('day_of_week'),
  avgTurnsToSuccess: real('avg_turns_to_success'),
  successRate: real('success_rate'),
  avgTokensPerLoop: integer('avg_tokens_per_loop'),
  avgCostPerLoop: real('avg_cost_per_loop'),
  avgTokensPerSecond: real('avg_tokens_per_second'),
  totalLoops: integer('total_loops').default(0),
  lastUpdated: text('last_updated').notNull().default(sql`(datetime('now'))`),
});

export const mcpUsage = sqliteTable('mcp_usage', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  loopId: integer('loop_id').notNull(),
  turnId: integer('turn_id'),
  model: text('model'),
  mcpServer: text('mcp_server').notNull(),
  toolName: text('tool_name').notNull(),
  inputSummary: text('input_summary'),
  outputSummary: text('output_summary'),
  success: integer('success').default(1),
  wasNecessary: integer('was_necessary'),
  couldHavePreventedError: integer('could_have_prevented_error').default(0),
  durationMs: integer('duration_ms'),
  createdAt: createdAt(),
});

export const mcpErrors = sqliteTable('mcp_errors', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  loopId: integer('loop_id').notNull(),
  turnId: integer('turn_id'),
  model: text('model'),
  mcpServer: text('mcp_server').notNull(),
  toolName: text('tool_name').notNull(),
  errorType: text('error_type'),
  errorMessage: text('error_message'),
  inputSummary: text('input_summary'),
  resolved: integer('resolved').default(0),
  createdAt: createdAt(),
});

export const mcpScores = sqliteTable('mcp_scores', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  loopId: integer('loop_id').notNull(),
  model: text('model'),
  shouldHaveUsed: text('should_have_used'),
  correctlyUsed: text('correctly_used'),
  incorrectlyUsed: text('incorrectly_used'),
  webSearchCount: integer('web_search_count').default(0),
  webSearchSuccess: integer('web_search_success').default(0),
  score: integer('score'),
  verifierNotes: text('verifier_notes'),
  createdAt: createdAt(),
});

export const benchmarkResults = sqliteTable('benchmark_results', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  benchmarkId: text('benchmark_id').notNull(),
  benchmarkName: text('benchmark_name'),
  model: text('model').notNull(),
  provider: text('provider'),
  featureSummary: text('feature_summary'),
  success: integer('success').default(0),
  turns: integer('turns'),
  inputTokens: integer('input_tokens'),
  outputTokens: integer('output_tokens'),
  costUsd: real('cost_usd'),
  durationSeconds: real('duration_seconds'),
  tokensPerSecond: real('tokens_per_second'),
  vramMb: integer('vram_mb'),
  quantization: text('quantization'),
  qualityScore: integer('quality_score'),
  testCoveragePct: real('test_coverage_pct'),
  mcpScore: integer('mcp_score'),
  createdAt: createdAt(),
});

export const qualityHistory = sqliteTable('quality_history', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  loopId: integer('loop_id').notNull(),
  commitHash: text('commit_hash'),
  testCoveragePct: real('test_coverage_pct'),
  complexityScore: real('complexity_score'),
  typeCoveragePct: real('type_coverage_pct'),
  mutationScore: real('mutation_score'),
  secretsFound: integer('secrets_found').default(0),
  vulnerabilitiesCritical: integer('vulnerabilities_critical').default(0),
  vulnerabilitiesHigh: integer('vulnerabilities_high').default(0),
  deadCodeCount: integer('dead_code_count').default(0),
  duplicateCodePct: real('duplicate_code_pct'),
  techDebtMinutes: integer('tech_debt_minutes'),
  lintErrors: integer('lint_errors').default(0),
  gatePassed: integer('gate_passed').default(0),
  createdAt: createdAt(),
});

export const uncertainTags = sqliteTable('uncertain_tags', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  loopId: integer('loop_id').notNull(),
  filePath: text('file_path').notNull(),
  lineNumber: integer('line_number'),
  codeSnippet: text('code_snippet'),
  modelNote: text('model_note'),
  verifierConfirmed: integer('verifier_confirmed').default(0),
  resolved: integer('resolved').default(0),
  resolutionNote: text('resolution_note'),
  createdAt: createdAt(),
  resolvedAt: text('resolved_at'),
});

export const promptVersions = sqliteTable('prompt_versions', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  promptType: text('prompt_type').notNull(),
  model: text('model'),
  featureType: text('feature_type'),
  version: text('version').notNull(),
  content: text('content').notNull(),
  successRate: real('success_rate'),
  avgTurns: real('avg_turns'),
  avgCost: real('avg_cost'),
  sampleCount: integer('sample_count').default(0),
  isActive: integer('is_active').default(1),
  createdAt: createdAt(),
  retiredAt: text('retired_at'),
});

export const notificationLog = sqliteTable('notification_log', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  channel: text('channel').notNull(),
  eventType: text('event_type').notNull(),
  message: text('message'),
  loopId: integer('loop_id'),
  sent: integer('sent').default(0),
  errorMessage: text('error_message'),
  createdAt: createdAt(),
});

export const tickets = sqliteTable('tickets', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  provider: text('provider').notNull(),
  ticketId: text('ticket_id').notNull(),
  title: text('title'),
  description: text('description'),
  status: text('status'),
  linkedFeatureId: text('linked_feature_id'),
  loopId: integer('loop_id'),
  commentPosted: integer('comment_posted').default(0),
  injectionDetected: integer('injection_detected').default(0),
  lastSynced: text('last_synced'),
  createdAt: createdAt(),
});

export const auditLog = sqliteTable('audit_log', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  eventType: text('event_type').notNull(),
  model: text('model'),
  loopId: integer('loop_id'),
  featureSummary: text('feature_summary'),
  filesChanged: text('files_changed'),
  diffSizeLines: integer('diff_size_lines'),
  commitHash: text('commit_hash'),
  signature: text('signature'),
  createdAt: createdAt(),
});

export const planningHistory = sqliteTable('planning_history', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  featureId: text('feature_id').notNull(),
  planningModel: text('planning_model'),
  planVersion: integer('plan_version').default(1),
  taskCount: integer('task_count'),
  estimatedEffortHours: real('estimated_effort_hours'),
  actualEffortHours: real('actual_effort_hours'),
  estimatedCostUsd: real('estimated_cost_usd'),
  actualCostUsd: real('actual_cost_usd'),
  dependencyCount: integer('dependency_count'),
  riskScore: real('risk_score'),
  planContent: text('plan_content'),
  score: real('score'),
  createdAt: createdAt(),
});

export const dbQueryAnalysis = sqliteTable('db_query_analysis', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  loopId: integer('loop_id'),
  queryHash: text('query_hash'),
  queryText: text('query_text'),
  explainOutput: text('explain_output'),
  executionTimeMs: real('execution_time_ms'),
  isSlow: integer('is_slow').default(0),
  optimizationSuggestion: text('optimization_suggestion'),
  indexSuggestion: text('index_suggestion'),
  createdAt: createdAt(),
});

export const userRatings = sqliteTable('user_ratings', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  loopId: integer('loop_id').notNull(),
  rating: integer('rating').notNull(),
  comment: text('comment'),
  falsePositive: integer('false_positive').default(0),
  createdAt: createdAt(),
});

export const flakyTests = sqliteTable('flaky_tests', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  testName: text('test_name').notNull().unique(),
  testFile: text('test_file'),
  passCount: integer('pass_count').default(0),
  failCount: integer('fail_count').default(0),
  flakyRate: real('flaky_rate'),
  firstSeen: text('first_seen').notNull().default(sql`(datetime('now'))`),
  lastSeen: text('last_seen').notNull().default(sql`(datetime('now'))`),
  resolved: integer('resolved').default(0),
  resolvedAt: text('resolved_at'),
});

export const goldenFiles = sqliteTable('golden_files', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  filePath: text('file_path').notNull().unique(),
  contentHash: text('content_hash').notNull(),
  lastVerified: text('last_verified'),
  createdAt: createdAt(),
});

export const agentCommunication = sqliteTable('agent_communication', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  fromAgent: text('from_agent').notNull(),
  toAgent: text('to_agent').notNull(),
  instruction: text('instruction'),
  context: text('context'),
  resultSummary: text('result_summary'),
  success: integer('success'),
  timestamp: text('timestamp').notNull(),
});

export const schema = {
  loopHistory,
  loopTurns,
  errorPatterns,
  successPatterns,
  modelProfiles,
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
  agentCommunication,
};

export type LoopRecord = typeof loopHistory.$inferSelect;
export type NewLoopRecord = typeof loopHistory.$inferInsert;
export type LoopTurn = typeof loopTurns.$inferSelect;
export type NewLoopTurn = typeof loopTurns.$inferInsert;
