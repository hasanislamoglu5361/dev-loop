// packages/core/src/db/queries/loop-history.ts
// Loop history query helpers for dev-loop SQLite database.
// Query helpers currently use better-sqlite3 directly.
// Keep SQL identifiers allow-listed because only values can be parameterized.

import { getDb } from './db.js';
import { sqlNullable, sqlBoolean } from './sql-values.js';
import { buildUpdate } from './updates.js';

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
    sqlNullable(options?.primaryModel),
    sqlNullable(options?.verifierModel),
    sqlBoolean(options?.fallbackUsed)
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

  const updateResult = buildUpdate(updates, LOOP_UPDATE_COLUMNS, {
    errorLabel: 'loop update',
    serialize: (_key, value) => (typeof value === 'boolean' ? Number(value) : value),
  });
  if (!updateResult) return;

  const values = [...updateResult.values, id];
  const sql = `UPDATE loop_history SET ${updateResult.setSql} WHERE id = ?`;
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
