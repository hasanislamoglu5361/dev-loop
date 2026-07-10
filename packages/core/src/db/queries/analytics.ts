// packages/core/src/db/queries/analytics.ts
// Analytics & trends query helpers for dev-loop SQLite database.
// Query helpers currently use better-sqlite3 directly.

import { getDb } from './db.js';
import { sqlNullable, toSqlSafe } from './sql-values.js';

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
    sqlNullable(params.comment),
    params.falsePositive ? 1 : 0
  );

  // Also update loop_history with user_rating
  db.prepare('UPDATE loop_history SET user_rating = ? WHERE id = ?').run(params.rating, params.loopId);
}

/** Get user ratings */
export async function getUserRatings(options?: { loopId?: number }): Promise<Record<string, unknown>[]> {
  const db = getDb();

  let sql = 'SELECT * FROM user_ratings WHERE 1=1';
  const params: unknown[] = [];

  if (options?.loopId) {
    sql += ` AND loop_id = ?`;
    params.push(options.loopId);
  }

  sql += ` ORDER BY created_at DESC, id DESC`;
  return db.prepare(sql).all(...params) as Record<string, unknown>[];
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
    sqlNullable(params.explainOutput),
    toSqlSafe(params.executionTimeMs),
    params.isSlow ? 1 : 0,
    sqlNullable(params.optimizationSuggestion),
    sqlNullable(params.indexSuggestion)
  );
}

// ============================================================
// PROMPT VERSIONS QUERIES (A/B Testing)
// ============================================================

/** Get active prompt version for a type/model/featureType */
export async function createPromptVersion(params: {
  promptType: string;
  model?: string;
  featureType?: string;
  version: string;
  content: string;
  successRate?: number;
  avgTurns?: number;
  avgCost?: number;
  sampleCount?: number;
  isActive?: boolean;
}): Promise<{ id: number }> {
  const db = getDb();
  const result = db.prepare(`
    INSERT INTO prompt_versions (
      prompt_type, model, feature_type, version, content, success_rate,
      avg_turns, avg_cost, sample_count, is_active
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    params.promptType,
    sqlNullable(params.model),
    sqlNullable(params.featureType),
    params.version,
    params.content,
    params.successRate ?? null,
    params.avgTurns ?? null,
    params.avgCost ?? null,
    params.sampleCount ?? 0,
    params.isActive === undefined ? 1 : Number(params.isActive)
  );

  return { id: result.lastInsertRowid as number };
}

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

  // Validate prompt version stats fields against allowed list to prevent SQL injection
  const ALLOWED_STATS_FIELDS = ['successRate', 'avgTurns', 'avgCost', 'sampleCount'] as const;
  for (const key of Object.keys(updates)) {
    if (!(ALLOWED_STATS_FIELDS as readonly string[]).includes(key as typeof ALLOWED_STATS_FIELDS[number])) {
      throw new Error(`Invalid prompt version stat field: ${key}`);
    }
  }

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
