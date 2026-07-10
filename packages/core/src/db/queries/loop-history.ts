// packages/core/src/db/queries/loop-history.ts
// Loop history query helpers for dev-loop SQLite database.
// Query helpers currently use better-sqlite3 directly.
// Keep SQL identifiers allow-listed because only values can be parameterized.

import { getDb } from './db.js';
import { sqlNullable, sqlBoolean } from './sql-values.js';
import { buildUpdate } from './updates.js';

const LOOP_UPDATE_COLUMNS = {
  featureSummary: 'feature_summary',
  featureKeywords: 'feature_keywords',
  featureType: 'feature_type',
  language: 'language',
  primaryModel: 'primary_model',
  primaryProvider: 'primary_provider',
  verifierModel: 'verifier_model',
  verifierProvider: 'verifier_provider',
  fallbackUsed: 'fallback_used',
  fallbackModel: 'fallback_model',
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
  userRating: 'user_rating',
  planningLoopId: 'planning_loop_id',
  sourceLoopId: 'source_loop_id',
  completedAt: 'completed_at',
} as const;

export interface CreateLoopOptions {
  featureSummary?: string;
  featureKeywords?: string;
  featureType?: string;
  language?: string;
  primaryModel?: string;
  primaryProvider?: string;
  verifierModel?: string;
  verifierProvider?: string;
  fallbackUsed?: boolean;
  fallbackModel?: string;
  planningLoopId?: number;
  sourceLoopId?: number;
}

export interface LoopUpdate {
  featureSummary: string;
  featureKeywords: string;
  featureType: string;
  language: string;
  primaryModel: string;
  primaryProvider: string;
  verifierModel: string;
  verifierProvider: string;
  fallbackUsed: boolean;
  fallbackModel: string;
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
  userRating: number;
  planningLoopId: number;
  completedAt: string;
}

export type CompleteLoopData = Partial<
  Pick<
    LoopUpdate,
    | 'totalTurns'
    | 'durationSeconds'
    | 'totalInputTokens'
    | 'totalOutputTokens'
    | 'totalCostUsd'
    | 'commitHash'
    | 'branchName'
    | 'prUrl'
    | 'qualityGatePassed'
    | 'testCoveragePct'
    | 'uncertainTagsFound'
    | 'uncertainTagsResolved'
    | 'userRating'
  >
>;

/** Create a new loop record and return the ID */
export async function createLoop(featureId: string, options: CreateLoopOptions = {}): Promise<{ id: number }> {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO loop_history (
      feature_id,
      feature_summary,
      feature_keywords,
      feature_type,
      language,
      primary_model,
      primary_provider,
      verifier_model,
      verifier_provider,
      fallback_used,
      fallback_model,
      planning_loop_id
      , source_loop_id
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const result = stmt.run(
    featureId,
    sqlNullable(options.featureSummary),
    sqlNullable(options.featureKeywords),
    sqlNullable(options.featureType),
    sqlNullable(options.language),
    sqlNullable(options.primaryModel),
    sqlNullable(options.primaryProvider),
    sqlNullable(options.verifierModel),
    sqlNullable(options.verifierProvider),
    sqlBoolean(options.fallbackUsed),
    sqlNullable(options.fallbackModel),
    options.planningLoopId ?? null,
    options.sourceLoopId ?? null
  );
  return { id: result.lastInsertRowid as number };
}

/** Update a loop record */
export async function updateLoop(id: number, updates: Partial<LoopUpdate>): Promise<void> {
  const db = getDb();

  const updateResult = buildUpdate(updates, LOOP_UPDATE_COLUMNS, {
    errorLabel: 'loop update',
    serialize: (_key, value) => (typeof value === 'boolean' ? Number(value) : value),
  });
  if (!updateResult) return;

  const values = [...updateResult.values, id];
  const sql = `UPDATE loop_history SET ${updateResult.setSql} WHERE id = ?`;
  db.prepare(sql).run(...values);
}

/** Mark a loop as complete and store final metrics */
export async function completeLoop(id: number, data: CompleteLoopData = {}): Promise<void> {
  await updateLoop(id, {
    ...data,
    success: true,
    completedAt: new Date().toISOString(),
  });
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
        bug.file ?? 'unknown',
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
