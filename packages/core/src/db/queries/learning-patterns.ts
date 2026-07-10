// packages/core/src/db/queries/learning-patterns.ts
// Learning system query helpers for dev-loop SQLite database.
// Error patterns, success patterns, uncertain tags, and benchmark queries.
// Query helpers currently use better-sqlite3 directly.

import { getDb } from './db.js';
import { sqlBoolean, sqlNullable, sqlJsonString, toSqlSafe } from './sql-values.js';
import { buildUpdate } from './updates.js';

// ============================================================
// ERROR PATTERNS (Learning System)
// ============================================================

const ERROR_PATTERN_SORTS = {
  seenCount: 'seen_count',
  lastSeen: 'last_seen',
  model: 'model',
} as const;

type ErrorPatternSortKey = keyof typeof ERROR_PATTERN_SORTS;

function sqlJsonArray(value: unknown[] | string | undefined): string | null {
  if (value === undefined) return null;
  if (Array.isArray(value)) return JSON.stringify(value);

  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) return value;
  } catch {
    // Fall through and store a plain string as a one-item array.
  }

  return JSON.stringify([value]);
}

function buildErrorPatternOrderBy(orderBy: string = 'seenCount', direction: string = 'desc'): string {
  const column = ERROR_PATTERN_SORTS[orderBy as ErrorPatternSortKey];
  if (!column) {
    throw new Error('Invalid orderBy field. Use one of: seenCount, lastSeen, model.');
  }

  const normalizedDirection = direction.toLowerCase() === 'asc' ? 'ASC' : 'DESC';
  return `${column} ${normalizedDirection}`;
}

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
  } else {
    sql += ` AND auto_inject = 1`;
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
  versionHistory?: unknown[] | string;
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
    sqlNullable(params.provider),
    sqlJsonString(params.featureKeywords),
    sqlNullable(params.language),
    params.errorDescription,
    sqlNullable(params.errorCategory),
    params.fixDescription,
    sqlNullable(params.fixExample),
    sqlNullable(params.versionContext),
    sqlJsonArray(params.versionHistory ?? []),
    params.seenCount ?? 1,
    sqlBoolean(params.autoInject ?? true)
  );

  return { id: result.lastInsertRowid as number };
}

/** Update an error pattern with allow-listed fields */
export async function updateErrorPattern(
  id: number,
  updates: Partial<Record<string, unknown>>
): Promise<void> {
  const db = getDb();

  // For error_patterns we use a limited set of updatable columns
  const ERROR_PATTERN_UPDATE_COLUMNS = {
    model: 'model',
    provider: 'provider',
    featureKeywords: 'feature_keywords',
    language: 'language',
    errorDescription: 'error_description',
    errorCategory: 'error_category',
    fixDescription: 'fix_description',
    fixExample: 'fix_example',
    versionContext: 'version_context',
    versionHistory: 'version_history',
    seenCount: 'seen_count',
    autoInject: 'auto_inject',
  } as const;

  type ErrorPatternUpdateKey = keyof typeof ERROR_PATTERN_UPDATE_COLUMNS;
  const updateResult = buildUpdate(updates as Partial<Record<ErrorPatternUpdateKey, unknown>>, ERROR_PATTERN_UPDATE_COLUMNS, {
    errorLabel: 'error pattern update',
    serialize: (key, value) => {
      if (key === 'featureKeywords' || key === 'versionHistory') {
        return sqlJsonArray(value as unknown[] | string | undefined);
      }

      if (key === 'autoInject') {
        return Number(value);
      }

      return value;
    },
  });
  if (!updateResult) return;

  const values = [...updateResult.values, id];
  const sql = `UPDATE error_patterns SET ${updateResult.setSql} WHERE id = ?`;
  db.prepare(sql).run(...values);
}

/** Retire an error pattern */
export async function retireErrorPattern(id: number): Promise<void> {
  await updateErrorPattern(id, { autoInject: false });
}

// ============================================================
// SUCCESS PATTERNS (Learning System)
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
    sqlNullable(params.provider),
    sqlJsonString(params.featureKeywords),
    sqlNullable(params.language),
    sqlNullable(params.featureType),
    sqlNullable(params.successDescription),
    sqlNullable(params.turnsToComplete),
    sqlNullable(params.promptVersion),
    sqlJsonString(params.mcpUsed)
  );

  return { id: result.lastInsertRowid as number };
}

/** Get distinct models observed in learning patterns */
export async function getDistinctModels(): Promise<string[]> {
  const db = getDb();
  const rows = db.prepare(`
    SELECT DISTINCT model FROM (
      SELECT model FROM error_patterns
      UNION
      SELECT model FROM success_patterns
    )
    WHERE model IS NOT NULL
    ORDER BY model ASC
  `).all() as Array<{ model: string }>;

  return rows.map(row => row.model);
}

/** Copy active error patterns from one model to another */
export async function copyErrorPatterns(params: {
  fromModel: string;
  toModel: string;
  toProvider?: string;
}): Promise<{ copied: number }> {
  const db = getDb();
  const rows = db.prepare(`
    SELECT *
    FROM error_patterns
    WHERE model = ? AND auto_inject = 1
    ORDER BY id ASC
  `).all(params.fromModel) as Array<{
    pattern_hash: string;
    provider: string | null;
    feature_keywords: string;
    language: string | null;
    error_description: string;
    error_category: string | null;
    fix_description: string;
    fix_example: string | null;
    version_context: string | null;
    version_history: string | null;
    seen_count: number | null;
    auto_inject: number | null;
  }>;

  const stmt = db.prepare(`
    INSERT OR IGNORE INTO error_patterns (
      pattern_hash, model, provider, feature_keywords, language, error_description,
      error_category, fix_description, fix_example, version_context, version_history,
      seen_count, auto_inject
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  let copied = 0;
  for (const row of rows) {
    const result = stmt.run(
      `${row.pattern_hash}:${params.toModel}`,
      params.toModel,
      params.toProvider ?? row.provider,
      row.feature_keywords,
      row.language,
      row.error_description,
      row.error_category,
      row.fix_description,
      row.fix_example,
      row.version_context,
      row.version_history,
      row.seen_count,
      row.auto_inject
    );
    copied += result.changes;
  }

  return { copied };
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
      sqlNullable(tag.snippet),
      sqlNullable(tag.note)
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
  `).run(sqlNullable(note), new Date().toISOString(), id);
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
    toSqlSafe(result.benchmark_id),
    toSqlSafe(result.benchmark_name),
    toSqlSafe(result.model),
    toSqlSafe(result.provider),
    toSqlSafe(result.feature_summary),
    result.success === undefined ? null : Number(result.success),
    toSqlSafe(result.turns),
    toSqlSafe(result.input_tokens),
    toSqlSafe(result.output_tokens),
    toSqlSafe(result.cost_usd),
    toSqlSafe(result.duration_seconds),
    toSqlSafe(result.tokens_per_second),
    toSqlSafe(result.vram_mb),
    toSqlSafe(result.quantization),
    toSqlSafe(result.quality_score),
    toSqlSafe(result.test_coverage_pct),
    toSqlSafe(result.mcp_score),
  ];

  const res = stmt.run(...values);
  return { id: res.lastInsertRowid as number };
}

/** Get all benchmarks */
export async function getAllBenchmarks(): Promise<Record<string, unknown>[]> {
  const db = getDb();
  return db.prepare('SELECT * FROM benchmark_results ORDER BY created_at DESC').all() as Record<string, unknown>[];
}
