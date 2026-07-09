// packages/core/src/db/queries.ts
// Type-safe database query helpers for dev-loop SQLite database
// Uses Drizzle ORM for all queries — never access SQLite directly

import Database from 'better-sqlite3';
import { getModelPricing } from '../config/defaults.js';
import { getDatabase } from './connection.js';

/** Get a fresh database connection */
export function getDb(): Database.Database {
  return getDatabase();
}

const LOOP_UPDATE_COLUMNS = {
  primaryModel: 'primary_model',
  verifierModel: 'verifier_model',
  fallbackUsed: 'fallback_used',
  totalTurns: 'total_turns',
  success: 'success',
  failureReason: 'failure_reason',
  durationSeconds: 'duration_seconds',
  totalInputTokens: 'total_input_tokens',
  totalOutputTokens: 'total_output_tokens',
  totalCostUsd: 'total_cost_usd',
  commitHash: 'commit_hash',
  branchName: 'branch_name',
  prUrl: 'pr_url',
  qualityGatePassed: 'quality_gate_passed',
  testCoveragePct: 'test_coverage_pct',
  uncertainTagsFound: 'uncertain_tags_found',
  uncertainTagsResolved: 'uncertain_tags_resolved',
  completedAt: 'completed_at',
} as const;

type LoopUpdateKey = keyof typeof LOOP_UPDATE_COLUMNS;

const ERROR_PATTERN_SORTS = {
  seenCount: 'seen_count',
  lastSeen: 'last_seen',
  model: 'model',
} as const;

type ErrorPatternSortKey = keyof typeof ERROR_PATTERN_SORTS;

function normalizeSqlValue(value: unknown): unknown {
  return typeof value === 'boolean' ? Number(value) : value;
}

function buildErrorPatternOrderBy(orderBy: string = 'seenCount', direction: string = 'desc'): string {
  const column = ERROR_PATTERN_SORTS[orderBy as ErrorPatternSortKey];
  if (!column) {
    throw new Error('Invalid orderBy field. Use one of: seenCount, lastSeen, model.');
  }

  const normalizedDirection = direction.toLowerCase() === 'asc' ? 'ASC' : 'DESC';
  return `${column} ${normalizedDirection}`;
}

// ============================================================
// LOOP HISTORY QUERIES
// ============================================================

/** Create a new loop record and return the ID */
export async function createLoop(
  featureId: string,
  options?: {
    primaryModel?: string;
    verifierModel?: string;
    fallbackUsed?: boolean;
  }
): Promise<{ id: number }> {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO loop_history (feature_id, primary_model, verifier_model, fallback_used)
    VALUES (?, ?, ?, ?)
  `);

  const result = stmt.run(
    featureId,
    options?.primaryModel ?? null,
    options?.verifierModel ?? null,
    options?.fallbackUsed === undefined ? null : Number(options.fallbackUsed)
  );
  return { id: result.lastInsertRowid as number };
}

/** Update a loop record */
export async function updateLoop(
  id: number,
  updates: Partial<{
    primaryModel: string;
    verifierModel: string;
    fallbackUsed: boolean;
    totalTurns: number;
    success: boolean;
    failureReason: string;
    durationSeconds: number;
    totalInputTokens: number;
    totalOutputTokens: number;
    totalCostUsd: number;
    commitHash: string;
    branchName: string;
    prUrl: string;
    qualityGatePassed: boolean;
    testCoveragePct: number;
    uncertainTagsFound: number;
    uncertainTagsResolved: number;
    completedAt: string;
  }>
): Promise<void> {
  const db = getDb();

  // Build dynamic update statement
  const fields: string[] = [];
  const values: unknown[] = [];

  for (const [key, value] of Object.entries(updates)) {
    if (value !== undefined) {
      if (!(key in LOOP_UPDATE_COLUMNS)) {
        throw new Error(`Unsupported loop update field: ${key}`);
      }

      fields.push(`${LOOP_UPDATE_COLUMNS[key as LoopUpdateKey]} = ?`);
      values.push(normalizeSqlValue(value));
    }
  }

  if (fields.length === 0) return;

  values.push(id);
  const sql = `UPDATE loop_history SET ${fields.join(', ')} WHERE id = ?`;
  db.prepare(sql).run(...values);
}

/** Fail a loop record with reason and bugs */
export async function failLoop(
  id: number,
  data: { reason: string; bugs?: unknown[] }
): Promise<void> {
  await updateLoop(id, {
    success: false,
    failureReason: data.reason,
    completedAt: new Date().toISOString(),
  });

  // Save bugs to uncertain_tags table if provided
  if (data.bugs && data.bugs.length > 0) {
    const db = getDb();
    const insertUncertain = db.prepare(`
      INSERT INTO uncertain_tags (loop_id, file_path, line_number, code_snippet, model_note)
      VALUES (?, ?, NULL, NULL, ?)
    `);

    for (const bug of data.bugs as Array<{ description: string; file?: string }>) {
      insertUncertain.run(
        id,
        bug.file || 'unknown',
        bug.description
      );
    }
  }
}

/** Get loop detail by ID */
export async function getLoopDetail(id: number): Promise<Record<string, unknown> | null> {
  const db = getDb();
  const stmt = db.prepare('SELECT * FROM loop_history WHERE id = ?');
  return stmt.get(id) as Record<string, unknown> | null;
}

/** Get recent loops with pagination */
export async function getRecentLoops(
  limit: number = 20,
  offset: number = 0
): Promise<Record<string, unknown>[]> {
  const db = getDb();
  const stmt = db.prepare(`
    SELECT * FROM loop_history
    ORDER BY created_at DESC
    LIMIT ? OFFSET ?
  `);
  return stmt.all(limit, offset) as Record<string, unknown>[];
}

/** Get loops filtered by model */
export async function getLoopsByModel(model: string): Promise<Record<string, unknown>[]> {
  const db = getDb();
  const stmt = db.prepare(`
    SELECT * FROM loop_history
    WHERE primary_model = ?
    ORDER BY created_at DESC
  `);
  return stmt.all(model) as Record<string, unknown>[];
}

/** Get loops filtered by date range */
export async function getLoopsByDateRange(
  from: string,
  to: string
): Promise<Record<string, unknown>[]> {
  const db = getDb();
  const stmt = db.prepare(`
    SELECT * FROM loop_history
    WHERE created_at BETWEEN ? AND ?
    ORDER BY created_at DESC
  `);
  return stmt.all(from, to) as Record<string, unknown>[];
}

// ============================================================
// LOOP TURNS QUERIES
// ============================================================

/** Create a new turn record */
export async function createLoopTurn(params: {
  loopId: number;
  turnNumber: number;
  agent: string;
  model?: string;
  inputTokens?: number;
  outputTokens?: number;
  costUsd?: number;
  durationSeconds?: number;
  success?: boolean;
  errorMessage?: string;
  errorType?: string;
  diffSizeLines?: number;
  filesChanged?: unknown[];
  uncertainTagsAdded?: number;
  mcpServersUsed?: string[];
}): Promise<{ id: number }> {
  const db = getDb();

  const stmt = db.prepare(`
    INSERT INTO loop_turns (
      loop_id, turn_number, agent, model, input_tokens, output_tokens, cost_usd,
      duration_seconds, success, error_message, error_type, diff_size_lines,
      files_changed, uncertain_tags_added, mcp_servers_used
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const result = stmt.run(
    params.loopId,
    params.turnNumber,
    params.agent,
    params.model || null,
    params.inputTokens || null,
    params.outputTokens || null,
    params.costUsd || null,
    params.durationSeconds || null,
    params.success ? 1 : 0,
    params.errorMessage || null,
    params.errorType || null,
    params.diffSizeLines || null,
    params.filesChanged ? JSON.stringify(params.filesChanged) : null,
    params.uncertainTagsAdded || 0,
    params.mcpServersUsed ? JSON.stringify(params.mcpServersUsed) : null
  );

  return { id: result.lastInsertRowid as number };
}

/** Update a loop turn */
export async function updateLoopTurn(
  id: number,
  updates: Partial<Record<string, unknown>>
): Promise<void> {
  const db = getDb();

  const fields: string[] = [];
  const values: unknown[] = [];

  for (const [key, value] of Object.entries(updates)) {
    if (value !== undefined) {
      fields.push(`${key} = ?`);
      values.push(value);
    }
  }

  if (fields.length === 0) return;

  values.push(id);
  const sql = `UPDATE loop_turns SET ${fields.join(', ')} WHERE id = ?`;
  db.prepare(sql).run(...values);
}

/** Get turns for a specific loop */
export async function getLoopTurns(loopId: number): Promise<Record<string, unknown>[]> {
  const db = getDb();
  const stmt = db.prepare(`
    SELECT * FROM loop_turns
    WHERE loop_id = ?
    ORDER BY turn_number ASC
  `);
  return stmt.all(loopId) as Record<string, unknown>[];
}

/** Count recent failures for a model */
export async function countRecentFailures(
  model: string,
  options?: { featureType?: string; withinLoops?: number }
): Promise<number> {
  const db = getDb();

  let sql = 'SELECT COUNT(*) as count FROM loop_turns WHERE model = ? AND success = 0';
  const params: unknown[] = [model];

  if (options?.featureType) {
    // Join with loop_history to filter by feature type
    sql += ` AND loop_id IN (SELECT id FROM loop_history WHERE feature_type = ?)`;
    params.push(options.featureType);
  }

  if (options?.withinLoops) {
    sql += ` LIMIT ?`;
    params.push(options.withinLoops * 2); // fetch more to count failures
  }

  const result = db.prepare(sql).get(...params) as { count: number };
  return result.count;
}

// ============================================================
// ERROR PATTERNS QUERIES (Learning System)
// ============================================================

/** Get matching error patterns by model and feature type */
export async function getErrorPatterns(
  options?: {
    model?: string;
    featureType?: string;
    autoInject?: boolean;
    orderBy?: string;
    orderDirection?: 'asc' | 'desc';
    limit?: number;
  }
): Promise<Record<string, unknown>[]> {
  const db = getDb();

  let sql = 'SELECT * FROM error_patterns WHERE 1=1';
  const params: unknown[] = [];

  if (options?.model) {
    sql += ` AND model = ?`;
    params.push(options.model);
  }

  if (options?.autoInject !== undefined) {
    sql += ` AND auto_inject = ?`;
    params.push(options.autoInject ? 1 : 0);
  }

  // Filter by feature keywords using LIKE on JSON array
  if (options?.featureType) {
    sql += ` AND feature_keywords LIKE ?`;
    params.push(`%${options.featureType}%`);
  }

  sql += ` ORDER BY ${buildErrorPatternOrderBy(options?.orderBy, options?.orderDirection)}`;

  if (options?.limit) {
    sql += ` LIMIT ?`;
    params.push(options.limit);
  }

  return db.prepare(sql).all(...params) as Record<string, unknown>[];
}

/** Get error pattern by hash */
export async function getErrorPatternByHash(hash: string): Promise<Record<string, unknown> | null> {
  const db = getDb();
  const stmt = db.prepare('SELECT * FROM error_patterns WHERE pattern_hash = ?');
  return stmt.get(hash) as Record<string, unknown> | null;
}

/** Create a new error pattern */
export async function createErrorPattern(params: {
  patternHash: string;
  model: string;
  provider?: string;
  featureKeywords: unknown[];
  language?: string;
  errorDescription: string;
  errorCategory?: string;
  fixDescription: string;
  fixExample?: string;
  versionContext?: string;
  versionHistory?: string;
  seenCount?: number;
  autoInject?: boolean;
}): Promise<{ id: number }> {
  const db = getDb();

  const stmt = db.prepare(`
    INSERT INTO error_patterns (
      pattern_hash, model, provider, feature_keywords, language, error_description,
      error_category, fix_description, fix_example, version_context, version_history,
      seen_count, auto_inject
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const result = stmt.run(
    params.patternHash,
    params.model,
    params.provider || null,
    JSON.stringify(params.featureKeywords),
    params.language || null,
    params.errorDescription,
    params.errorCategory || null,
    params.fixDescription,
    params.fixExample || null,
    params.versionContext || null,
    params.versionHistory || '[]',
    params.seenCount || 1,
    params.autoInject ? 1 : 0
  );

  return { id: result.lastInsertRowid as number };
}

/** Update an error pattern */
export async function updateErrorPattern(
  id: number,
  updates: Partial<Record<string, unknown>>
): Promise<void> {
  const db = getDb();

  const fields: string[] = [];
  const values: unknown[] = [];

  for (const [key, value] of Object.entries(updates)) {
    if (value !== undefined) {
      fields.push(`${key} = ?`);
      values.push(value);
    }
  }

  if (fields.length === 0) return;

  values.push(id);
  const sql = `UPDATE error_patterns SET ${fields.join(', ')} WHERE id = ?`;
  db.prepare(sql).run(...values);
}

/** Retire an error pattern */
export async function retireErrorPattern(id: number): Promise<void> {
  await updateErrorPattern(id, { autoInject: false });
}

// ============================================================
// SUCCESS PATTERNS QUERIES (Learning System)
// ============================================================

/** Get success patterns by model */
export async function getSuccessPatterns(options?: { model?: string }): Promise<Record<string, unknown>[]> {
  const db = getDb();

  let sql = 'SELECT * FROM success_patterns WHERE 1=1';
  const params: unknown[] = [];

  if (options?.model) {
    sql += ` AND model = ?`;
    params.push(options.model);
  }

  return db.prepare(sql).all(...params) as Record<string, unknown>[];
}

/** Create a new success pattern */
export async function createSuccessPattern(params: {
  model: string;
  provider?: string;
  featureKeywords: unknown[];
  language?: string;
  featureType?: string;
  successDescription?: string;
  turnsToComplete?: number;
  promptVersion?: string;
  mcpUsed?: string[];
}): Promise<{ id: number }> {
  const db = getDb();

  const stmt = db.prepare(`
    INSERT INTO success_patterns (
      model, provider, feature_keywords, language, feature_type, success_description,
      turns_to_complete, prompt_version, mcp_used
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const result = stmt.run(
    params.model,
    params.provider || null,
    JSON.stringify(params.featureKeywords),
    params.language || null,
    params.featureType || null,
    params.successDescription || null,
    params.turnsToComplete || null,
    params.promptVersion || null,
    params.mcpUsed ? JSON.stringify(params.mcpUsed) : null
  );

  return { id: result.lastInsertRowid as number };
}

// ============================================================
// MCP USAGE QUERIES
// ============================================================

/** Get MCP usage records */
export async function getMcpUsage(options?: { loopId?: number; model?: string }): Promise<Record<string, unknown>[]> {
  const db = getDb();

  let sql = 'SELECT * FROM mcp_usage WHERE 1=1';
  const params: unknown[] = [];

  if (options?.loopId) {
    sql += ` AND loop_id = ?`;
    params.push(options.loopId);
  }

  if (options?.model) {
    sql += ` AND model = ?`;
    params.push(options.model);
  }

  return db.prepare(sql).all(...params) as Record<string, unknown>[];
}

/** Save MCP score for a loop */
export async function saveMcpScore(
  loopId: number,
  mcpScore: {
    model?: string;
    shouldHaveUsed?: string[];
    correctlyUsed?: string[];
    incorrectlyUsed?: string[];
    webSearchCount?: number;
    webSearchSuccess?: number;
    score: number;
    verifierNotes?: string;
  }
): Promise<{ id: number }> {
  const db = getDb();

  const stmt = db.prepare(`
    INSERT INTO mcp_scores (loop_id, model, should_have_used, correctly_used, incorrectly_used, web_search_count, web_search_success, score, verifier_notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const result = stmt.run(
    loopId,
    mcpScore.model || null,
    mcpScore.shouldHaveUsed ? JSON.stringify(mcpScore.shouldHaveUsed) : null,
    mcpScore.correctlyUsed ? JSON.stringify(mcpScore.correctlyUsed) : null,
    mcpScore.incorrectlyUsed ? JSON.stringify(mcpScore.incorrectlyUsed) : null,
    mcpScore.webSearchCount || 0,
    mcpScore.webSearchSuccess || 0,
    mcpScore.score,
    mcpScore.verifierNotes || null
  );

  return { id: result.lastInsertRowid as number };
}

/** Get MCP errors */
export async function getMcpErrors(options?: { loopId?: number }): Promise<Record<string, unknown>[]> {
  const db = getDb();

  let sql = 'SELECT * FROM mcp_errors WHERE 1=1';
  const params: unknown[] = [];

  if (options?.loopId) {
    sql += ` AND loop_id = ?`;
    params.push(options.loopId);
  }

  return db.prepare(sql).all(...params) as Record<string, unknown>[];
}

/** Get MCP scores */
export async function getMcpScores(): Promise<Record<string, unknown>[]> {
  const db = getDb();
  return db.prepare('SELECT * FROM mcp_scores ORDER BY created_at DESC').all() as Record<string, unknown>[];
}

// ============================================================
// UNCERTAIN TAGS QUERIES
// ============================================================

/** Save uncertain tags for a loop */
export async function saveUncertainTags(
  loopId: number,
  tags: Array<{ file: string; line: number; snippet?: string; note?: string }>
): Promise<void> {
  const db = getDb();

  const stmt = db.prepare(`
    INSERT INTO uncertain_tags (loop_id, file_path, line_number, code_snippet, model_note)
    VALUES (?, ?, ?, ?, ?)
  `);

  for (const tag of tags) {
    stmt.run(
      loopId,
      tag.file,
      tag.line,
      tag.snippet || null,
      tag.note || null
    );
  }
}

/** Get uncertain tags for a loop */
export async function getUncertainTags(options?: { loopId?: number }): Promise<Record<string, unknown>[]> {
  const db = getDb();

  let sql = 'SELECT * FROM uncertain_tags WHERE 1=1';
  const params: unknown[] = [];

  if (options?.loopId) {
    sql += ` AND loop_id = ?`;
    params.push(options.loopId);
  }

  return db.prepare(sql).all(...params) as Record<string, unknown>[];
}

/** Get unresolved uncertain tags */
export async function getUnresolvedUncertainTags(loopId: number): Promise<Record<string, unknown>[]> {
  const db = getDb();
  const stmt = db.prepare(`
    SELECT * FROM uncertain_tags
    WHERE loop_id = ? AND resolved = 0
    ORDER BY created_at ASC
  `);
  return stmt.all(loopId) as Record<string, unknown>[];
}

/** Resolve an uncertain tag */
export async function resolveUncertainTag(
  id: number,
  note?: string
): Promise<void> {
  const db = getDb();
  db.prepare(`
    UPDATE uncertain_tags
    SET resolved = 1, resolution_note = ?, resolved_at = ?
    WHERE id = ?
  `).run(note || null, new Date().toISOString(), id);
}

// ============================================================
// BENCHMARK QUERIES
// ============================================================

/** Save benchmark result */
export async function saveBenchmarkResult(result: Record<string, unknown>): Promise<{ id: number }> {
  const db = getDb();

  const stmt = db.prepare(`
    INSERT INTO benchmark_results (
      benchmark_id, benchmark_name, model, provider, feature_summary, success, turns,
      input_tokens, output_tokens, cost_usd, duration_seconds, tokens_per_second,
      vram_mb, quantization, quality_score, test_coverage_pct, mcp_score
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const values = [
    result.benchmark_id || null,
    result.benchmark_name || null,
    result.model || null,
    result.provider || null,
    result.feature_summary || null,
    result.success ? 1 : 0,
    result.turns || null,
    result.input_tokens || null,
    result.output_tokens || null,
    result.cost_usd || null,
    result.duration_seconds || null,
    result.tokens_per_second || null,
    result.vram_mb || null,
    result.quantization || null,
    result.quality_score || null,
    result.test_coverage_pct || null,
    result.mcp_score || null,
  ];

  const res = stmt.run(...values);
  return { id: res.lastInsertRowid as number };
}

/** Get all benchmarks */
export async function getAllBenchmarks(): Promise<Record<string, unknown>[]> {
  const db = getDb();
  return db.prepare('SELECT * FROM benchmark_results ORDER BY created_at DESC').all() as Record<string, unknown>[];
}

// ============================================================
// QUALITY HISTORY QUERIES
// ============================================================

/** Save quality history for a loop */
export async function saveQualityHistory(
  loopId: number,
  metrics: {
    testCoveragePct?: number;
    complexityScore?: number;
    typeCoveragePct?: number;
    mutationScore?: number;
    secretsFound?: number;
    vulnerabilitiesCritical?: number;
    vulnerabilitiesHigh?: number;
    deadCodeCount?: number;
    duplicateCodePct?: number;
    techDebtMinutes?: number;
    lintErrors?: number;
    gatePassed?: boolean;
  }
): Promise<{ id: number }> {
  const db = getDb();

  const stmt = db.prepare(`
    INSERT INTO quality_history (
      loop_id, test_coverage_pct, complexity_score, type_coverage_pct, mutation_score,
      secrets_found, vulnerabilities_critical, vulnerabilities_high, dead_code_count,
      duplicate_code_pct, tech_debt_minutes, lint_errors, gate_passed
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const result = stmt.run(
    loopId,
    metrics.testCoveragePct || null,
    metrics.complexityScore || null,
    metrics.typeCoveragePct || null,
    metrics.mutationScore || null,
    metrics.secretsFound || 0,
    metrics.vulnerabilitiesCritical || 0,
    metrics.vulnerabilitiesHigh || 0,
    metrics.deadCodeCount || 0,
    metrics.duplicateCodePct || null,
    metrics.techDebtMinutes || null,
    metrics.lintErrors || 0,
    metrics.gatePassed ? 1 : 0
  );

  return { id: result.lastInsertRowid as number };
}

/** Get quality history */
export async function getQualityHistory(): Promise<Record<string, unknown>[]> {
  const db = getDb();
  return db.prepare('SELECT * FROM quality_history ORDER BY created_at DESC').all() as Record<string, unknown>[];
}

// ============================================================
// MODEL PROFILES QUERIES (Calibration)
// ============================================================

/** Get best model for feature type */
export async function getBestModelForFeatureType(options: {
  featureType?: string;
  language?: string;
  maxCostPer1kTokens?: number;
  minSuccessRate?: number;
  minSamples?: number;
}): Promise<{ model: string; provider: string } | null> {
  const db = getDb();

  let sql = `
    SELECT model, provider, AVG(success_rate) as avg_success, SUM(total_loops) as total_loops
    FROM model_profiles
    WHERE 1=1
  `;

  if (options.featureType) {
    sql += ` AND feature_type = ?`;
  }

  if (options.language) {
    sql += ` AND language = ?`;
  }

  const params: unknown[] = [];
  if (options.featureType) params.push(options.featureType);
  if (options.language) params.push(options.language);

  sql += ` GROUP BY model, provider HAVING SUM(total_loops) >= ?`;
  params.push(options.minSamples || 3);

  if (options.minSuccessRate !== undefined) {
    sql += ` AND AVG(success_rate) >= ?`;
    params.push(options.minSuccessRate);
  }

  sql += ` ORDER BY avg_success DESC LIMIT 1`;

  // Apply cost filter via additional query
  let result = db.prepare(sql).get(...params) as { model: string; provider: string } | undefined;

  if (!result) return null;

  if (options.maxCostPer1kTokens) {
    const pricing = getModelPricing(result.provider, result.model);
    // Assume average 5000 input + 2000 output tokens per loop
    const estimatedCost = (5 * pricing.input + 2 * pricing.output);
    if (estimatedCost > options.maxCostPer1kTokens) {
      return null; // Too expensive, try next
    }
  }

  return result || null;
}

/** Update model calibration profile */
export async function updateModelProfile(params: {
  model: string;
  provider?: string;
  featureType?: string;
  language?: string;
  hourOfDay?: number;
  dayOfWeek?: number;
  avgTurnsToSuccess?: number;
  successRate?: number;
  avgTokensPerLoop?: number;
  avgCostPerLoop?: number;
  avgTokensPerSecond?: number;
}): Promise<void> {
  const db = getDb();

  // Upsert logic: check if exists first
  let profile = db.prepare(`
    SELECT id FROM model_profiles
    WHERE model = ? AND provider = ? AND feature_type = ? AND language = ? AND hour_of_day = ?
  `).get(
    params.model,
    params.provider || null,
    params.featureType || null,
    params.language || null,
    params.hourOfDay ?? null
  ) as { id: number } | undefined;

  if (profile) {
    // Update existing
    db.prepare(`
      UPDATE model_profiles SET
        avg_turns_to_success = ?, success_rate = ?, avg_tokens_per_loop = ?,
        avg_cost_per_loop = ?, avg_tokens_per_second = ?, total_loops = total_loops + 1,
        last_updated = ?
      WHERE id = ?
    `).run(
      params.avgTurnsToSuccess ?? null,
      params.successRate ?? null,
      params.avgTokensPerLoop ?? null,
      params.avgCostPerLoop ?? null,
      params.avgTokensPerSecond ?? null,
      new Date().toISOString(),
      profile.id
    );
  } else {
    // Insert new
    db.prepare(`
      INSERT INTO model_profiles (model, provider, feature_type, language, hour_of_day, day_of_week,
        avg_turns_to_success, success_rate, avg_tokens_per_loop, avg_cost_per_loop,
        avg_tokens_per_second, total_loops)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
    `).run(
      params.model,
      params.provider || null,
      params.featureType || null,
      params.language || null,
      params.hourOfDay ?? null,
      params.dayOfWeek ?? null,
      params.avgTurnsToSuccess ?? null,
      params.successRate ?? null,
      params.avgTokensPerLoop ?? null,
      params.avgCostPerLoop ?? null,
      params.avgTokensPerSecond ?? null
    );
  }
}

// ============================================================
// TICKET SYNC QUERIES (Jira/Linear/GitHub Issues)
// ============================================================

/** Save or update a ticket */
export async function saveTicket(params: {
  provider: string;
  ticketId: string;
  title?: string;
  description?: string;
  status?: string;
  linkedFeatureId?: string;
  loopId?: number;
  commentPosted?: boolean;
  injectionDetected?: boolean;
}): Promise<void> {
  const db = getDb();

  // Check if exists
  let existing = db.prepare(`SELECT id FROM tickets WHERE provider = ? AND ticket_id = ?`).get(
    params.provider,
    params.ticketId
  ) as { id: number } | undefined;

  if (existing) {
    // Update
    db.prepare(`
      UPDATE tickets SET title = ?, description = ?, status = ?, linked_feature_id = ?, loop_id = ?, comment_posted = ?, injection_detected = ?
      WHERE provider = ? AND ticket_id = ?
    `).run(
      params.title || null,
      params.description || null,
      params.status || null,
      params.linkedFeatureId || null,
      params.loopId ?? null,
      params.commentPosted ? 1 : 0,
      params.injectionDetected ? 1 : 0,
      params.provider,
      params.ticketId
    );
  } else {
    // Insert
    db.prepare(`
      INSERT INTO tickets (provider, ticket_id, title, description, status, linked_feature_id, loop_id, comment_posted, injection_detected)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      params.provider,
      params.ticketId,
      params.title || null,
      params.description || null,
      params.status || null,
      params.linkedFeatureId || null,
      params.loopId ?? null,
      params.commentPosted ? 1 : 0,
      params.injectionDetected ? 1 : 0
    );
  }
}

/** Get ticket by provider and ID */
export async function getTicket(provider: string, ticketId: string): Promise<Record<string, unknown> | null> {
  const db = getDb();
  const stmt = db.prepare('SELECT * FROM tickets WHERE provider = ? AND ticket_id = ?');
  return stmt.get(provider, ticketId) as Record<string, unknown> | null;
}

// ============================================================
// NOTIFICATION LOG QUERIES
// ============================================================

/** Log a notification */
export async function logNotification(params: {
  channel: string;
  eventType: string;
  message?: string;
  loopId?: number;
  sent?: boolean;
  errorMessage?: string;
}): Promise<void> {
  const db = getDb();

  db.prepare(`
    INSERT INTO notification_log (channel, event_type, message, loop_id, sent, error_message)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    params.channel,
    params.eventType,
    params.message || null,
    params.loopId ?? null,
    params.sent ? 1 : 0,
    params.errorMessage || null
  );
}

/** Get notification log */
export async function getNotificationLog(): Promise<Record<string, unknown>[]> {
  const db = getDb();
  return db.prepare('SELECT * FROM notification_log ORDER BY created_at DESC').all() as Record<string, unknown>[];
}

// ============================================================
// PLANNING QUERIES
// ============================================================

/** Save planning history */
export async function savePlanningHistory(params: {
  featureId: string;
  planningModel?: string;
  planVersion?: number;
  taskCount?: number;
  estimatedEffortHours?: number;
  actualEffortHours?: number;
  estimatedCostUsd?: number;
  actualCostUsd?: number;
  dependencyCount?: number;
  riskScore?: number;
  planContent?: unknown;
}): Promise<{ id: number }> {
  const db = getDb();

  const stmt = db.prepare(`
    INSERT INTO planning_history (feature_id, planning_model, plan_version, task_count, estimated_effort_hours, actual_effort_hours, estimated_cost_usd, actual_cost_usd, dependency_count, risk_score, plan_content)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const result = stmt.run(
    params.featureId,
    params.planningModel || null,
    params.planVersion ?? null,
    params.taskCount ?? null,
    params.estimatedEffortHours ?? null,
    params.actualEffortHours ?? null,
    params.estimatedCostUsd ?? null,
    params.actualCostUsd ?? null,
    params.dependencyCount ?? null,
    params.riskScore ?? null,
    params.planContent ? JSON.stringify(params.planContent) : null
  );

  return { id: result.lastInsertRowid as number };
}

/** Get planning history */
export async function getPlanningHistory(): Promise<Record<string, unknown>[]> {
  const db = getDb();
  return db.prepare('SELECT * FROM planning_history ORDER BY created_at DESC').all() as Record<string, unknown>[];
}

// ============================================================
// USER RATINGS QUERIES
// ============================================================

/** Save user rating for a loop */
export async function saveUserRating(params: { loopId: number; rating: number; comment?: string; falsePositive?: boolean }): Promise<void> {
  const db = getDb();

  db.prepare(`
    INSERT INTO user_ratings (loop_id, rating, comment, false_positive)
    VALUES (?, ?, ?, ?)
  `).run(
    params.loopId,
    params.rating,
    params.comment || null,
    params.falsePositive ? 1 : 0
  );

  // Also update loop_history with user_rating
  db.prepare('UPDATE loop_history SET user_rating = ? WHERE id = ?').run(params.rating, params.loopId);
}

// ============================================================
// FLAKY TESTS QUERIES
// ============================================================

/** Upsert flaky test */
export async function upsertFlakyTest(params: { testName: string; testFile?: string; passed: boolean }): Promise<void> {
  const db = getDb();

  // Check if exists
  let existing = db.prepare('SELECT id FROM flaky_tests WHERE test_name = ?').get(
    params.testName
  ) as { id: number } | undefined;

  if (existing) {
    // Update counts
    const field = params.passed ? 'pass_count' : 'fail_count';
    db.prepare(`UPDATE flaky_tests SET ${field} = ${field} + 1 WHERE test_name = ?`).run(
      params.testName
    );
  } else {
    // Insert new
    db.prepare(`
      INSERT INTO flaky_tests (test_name, test_file, pass_count, fail_count)
      VALUES (?, ?, ?, ?)
    `).run(
      params.testName,
      params.testFile || null,
      params.passed ? 1 : 0,
      params.passed ? 0 : 1
    );
  }

  // Recalculate flaky rate
  const test = db.prepare('SELECT pass_count, fail_count FROM flaky_tests WHERE test_name = ?').get(
    params.testName
  ) as { pass_count: number; fail_count: number } | undefined;

  if (test) {
    const total = test.pass_count + test.fail_count;
    if (total > 0) {
      const flakyRate = Math.min(test.pass_count, test.fail_count) / total;
      db.prepare('UPDATE flaky_tests SET flaky_rate = ?, last_seen = ? WHERE test_name = ?').run(
        flakyRate,
        new Date().toISOString(),
        params.testName
      );

      // Mark as flaky if rate > 10% and < 90%
      if (flakyRate > 0.1 && flakyRate < 0.9) {
        db.prepare('UPDATE flaky_tests SET resolved = 0 WHERE test_name = ?').run(
          params.testName
        );
      }
    }
  }
}

/** Get all flaky tests */
export async function getFlakyTests(): Promise<Record<string, unknown>[]> {
  const db = getDb();
  return db.prepare('SELECT * FROM flaky_tests ORDER BY last_seen DESC').all() as Record<string, unknown>[];
}

// ============================================================
// DATABASE QUERY ANALYSIS QUERIES
// ============================================================

/** Save query analysis result */
export async function saveQueryAnalysis(params: {
  loopId?: number;
  queryHash: string;
  queryText: string;
  explainOutput?: string;
  executionTimeMs?: number;
  isSlow?: boolean;
  optimizationSuggestion?: string;
  indexSuggestion?: string;
}): Promise<void> {
  const db = getDb();

  db.prepare(`
    INSERT INTO db_query_analysis (loop_id, query_hash, query_text, explain_output, execution_time_ms, is_slow, optimization_suggestion, index_suggestion)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    params.loopId ?? null,
    params.queryHash,
    params.queryText.substring(0, 500), // truncate for storage
    params.explainOutput || null,
    params.executionTimeMs || null,
    params.isSlow ? 1 : 0,
    params.optimizationSuggestion || null,
    params.indexSuggestion || null
  );
}

// ============================================================
// PROMPT VERSIONS QUERIES (A/B Testing)
// ============================================================

/** Get active prompt version for a type/model/featureType */
export async function getActivePromptVersion(
  promptType: string,
  model?: string,
  featureType?: string
): Promise<Record<string, unknown> | null> {
  const db = getDb();

  let sql = 'SELECT * FROM prompt_versions WHERE is_active = 1';
  const params: unknown[] = [];

  if (promptType) {
    sql += ` AND prompt_type = ?`;
    params.push(promptType);
  }

  if (model) {
    sql += ` AND model = ?`;
    params.push(model);
  }

  if (featureType) {
    sql += ` AND feature_type = ?`;
    params.push(featureType);
  }

  return db.prepare(sql).get(...params) as Record<string, unknown> | null;
}

/** Update prompt version success rate */
export async function updatePromptVersionStats(
  id: number,
  updates: { successRate?: number; avgTurns?: number; avgCost?: number; sampleCount?: number }
): Promise<void> {
  const db = getDb();

  const fields: string[] = [];
  const values: unknown[] = [];

  if (updates.successRate !== undefined) {
    fields.push('success_rate = ?');
    values.push(updates.successRate);
  }
  if (updates.avgTurns !== undefined) {
    fields.push('avg_turns = ?');
    values.push(updates.avgTurns);
  }
  if (updates.avgCost !== undefined) {
    fields.push('avg_cost = ?');
    values.push(updates.avgCost);
  }
  if (updates.sampleCount !== undefined) {
    fields.push('sample_count = sample_count + ?');
    values.push(updates.sampleCount);
  }

  if (fields.length === 0) return;

  values.push(id);
  db.prepare(`UPDATE prompt_versions SET ${fields.join(', ')} WHERE id = ?`).run(...values);
}

// ============================================================
// ANALYTICS & TRENDS QUERIES
// ============================================================

/** Get cost trend for the last N days */
export async function getCostTrend(days: number): Promise<{ date: string; totalCostUsd: number }[]> {
  const db = getDb();
  const stmt = db.prepare(`
    SELECT DATE(created_at) as date, SUM(total_cost_usd) as totalCostUsd
    FROM loop_history
    WHERE created_at >= datetime('now', ?)
    GROUP BY DATE(created_at)
    ORDER BY date ASC
  `);
  return stmt.all(`-${days} days`) as { date: string; totalCostUsd: number }[];
}

/** Get quality trend for the last N days */
export async function getQualityTrend(days: number): Promise<{ date: string; avgCoverage: number }[]> {
  const db = getDb();
  const stmt = db.prepare(`
    SELECT DATE(l.created_at) as date, AVG(q.test_coverage_pct) as avgCoverage
    FROM quality_history q
    JOIN loop_history l ON q.loop_id = l.id
    WHERE l.created_at >= datetime('now', ?)
    GROUP BY DATE(l.created_at)
    ORDER BY date ASC
  `);
  return stmt.all(`-${days} days`) as { date: string; avgCoverage: number }[];
}

/** Get model performance matrix */
export async function getModelPerformanceMatrix(): Promise<{ model: string; featureType?: string; successRate: number; totalLoops: number }[]> {
  const db = getDb();
  return db.prepare(`
    SELECT primary_model as model, feature_type as featureType,
           CAST(SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) AS REAL) / COUNT(*) * 100 as successRate,
           COUNT(*) as totalLoops
    FROM loop_history
    GROUP BY primary_model, feature_type
    ORDER BY model, featureType
  `).all() as { model: string; featureType?: string; successRate: number; totalLoops: number }[];
}

/** Get planning scores */
export async function getPlanningScores(): Promise<{ score: number; planningModel?: string }[]> {
  const db = getDb();
  return db.prepare(`
    SELECT score, planning_model as planningModel
    FROM planning_history
    WHERE score IS NOT NULL
    ORDER BY created_at DESC LIMIT 20
  `).all() as { score: number; planningModel?: string }[];
}

/** Get uncertain report */
export async function getUncertainReport(): Promise<{ total: number; unresolved: number }> {
  const db = getDb();
  const total = (db.prepare('SELECT COUNT(*) as count FROM uncertain_tags').get() as { count: number }).count;
  const unresolved = (db.prepare('SELECT COUNT(*) as count FROM uncertain_tags WHERE resolved = 0').get() as { count: number }).count;
  return { total, unresolved };
}

/** Get top error patterns */
export async function getTopErrorPatterns(limit?: number): Promise<Record<string, unknown>[]> {
  const db = getDb();
  const stmt = db.prepare('SELECT * FROM error_patterns ORDER BY seen_count DESC LIMIT ?');
  return stmt.all(limit || 10) as Record<string, unknown>[];
}

// ============================================================
// EXECUTIVE SUMMARY & REPORTS QUERIES
// ============================================================

/** Get recent analytics for executive summary */
export async function getRecentAnalytics(days: number = 7): Promise<{ totalLoops: number; successRate: number; totalCost: number }> {
  const db = getDb();
  const row = db.prepare(`
    SELECT COUNT(*) as cnt,
           COALESCE(CAST(SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) AS REAL) / MAX(COUNT(*), 1) * 100, 0) as successRate,
           COALESCE(SUM(total_cost_usd), 0) as totalCost
    FROM loop_history
    WHERE created_at >= datetime('now', ?)
  `).get(`-${days} days`) as { cnt: number; successRate: number; totalCost: number } | undefined;

  return row ? { totalLoops: row.cnt, successRate: row.successRate, totalCost: row.totalCost } : { totalLoops: 0, successRate: 0, totalCost: 0 };
}

/** Get comparison report between two date ranges */
export async function getComparisonReport(params: { from1: string; to1: string; from2: string; to2: string }): Promise<{ period1: { loops: number; cost: number; successRate: number }; period2: { loops: number; cost: number; successRate: number } }> {
  const db = getDb();

  const [p1, p2] = await Promise.all([
    db.prepare(`SELECT COUNT(*) as loops, SUM(total_cost_usd) as cost, CAST(SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) AS REAL) / COUNT(*) * 100 as successRate FROM loop_history WHERE created_at BETWEEN ? AND ?`).get(params.from1, params.to1) as { loops: number; cost: number; successRate: number } | undefined,
    db.prepare(`SELECT COUNT(*) as loops, SUM(total_cost_usd) as cost, CAST(SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) AS REAL) / COUNT(*) * 100 as successRate FROM loop_history WHERE created_at BETWEEN ? AND ?`).get(params.from2, params.to2) as { loops: number; cost: number; successRate: number } | undefined
  ]);

  return {
    period1: p1 || { loops: 0, cost: 0, successRate: 0 },
    period2: p2 || { loops: 0, cost: 0, successRate: 0 },
  };
}

/** Get report data for export */
export async function getReportData(dateRange: { from: string; to: string }): Promise<{ loops: Record<string, unknown>[] }> {
  const db = getDb();
  const stmt = db.prepare(`SELECT * FROM loop_history WHERE created_at BETWEEN ? AND ? ORDER BY created_at DESC`);
  return { loops: stmt.all(dateRange.from, dateRange.to) as Record<string, unknown>[] };
}

// ============================================================
// DATABASE MAINTENANCE QUERIES
// ============================================================

/** Vacuum and optimize database */
export async function vacuum(): Promise<void> {
  const db = getDb();
  db.pragma('VACUUM');
}

/** Check database integrity */
export async function checkIntegrity(): Promise<{ ok: boolean; message?: string }> {
  const db = getDb();
  try {
    const result = db.pragma('integrity_check');
    if (Array.isArray(result) && (result as [string][])[0]?.[0] === 'ok') {
      return { ok: true };
    } else {
      const msg = Array.isArray(result) ? ((result as [string][])[0]?.[0]) : String(result);
      return { ok: false, message: `Integrity check failed: ${msg}` };
    }
  } catch (err) {
    return { ok: false, message: `Integrity check error: ${(err as Error).message}` };
  }
}

/** Get database statistics */
export async function getDbStats(): Promise<{ size: number; tableCount: number }> {
  const db = getDb();
  const statsStmt = db.prepare(`PRAGMA page_count`);
  const pageSizeStmt = db.prepare(`PRAGMA page_size`);

  const pageCount = (statsStmt.get() as { page_count: number }).page_count;
  const pageSize = (pageSizeStmt.get() as { page_size: number }).page_size;

  // Count tables
  const tableCount = db.prepare("SELECT COUNT(*) as count FROM sqlite_master WHERE type='table'").get() as { count: number };

  return { size: pageCount * pageSize, tableCount: tableCount.count };
}

// ============================================================
// RAW QUERY EXECUTION (for natural language queries)
// ============================================================

/** Execute a raw SQL query and return results */
export async function rawQuery(sql: string): Promise<Record<string, unknown>[]> {
  const db = getDb();
  // Security: only allow SELECT statements
  if (!sql.trim().toUpperCase().startsWith('SELECT')) {
    throw new Error('Only SELECT queries are allowed');
  }

  try {
    return db.prepare(sql).all() as Record<string, unknown>[];
  } catch (err) {
    throw new Error(`Query execution failed: ${(err as Error).message}`);
  }
}
