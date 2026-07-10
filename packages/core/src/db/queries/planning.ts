// packages/core/src/db/queries/planning.ts
// Planning history query helpers for dev-loop SQLite database.
// Query helpers currently use better-sqlite3 directly.

import { getDb } from './db.js';
import { sqlNullable, sqlJsonString } from './sql-values.js';

/** Save planning history */
export async function savePlanningHistory(params: {
  featureId: string | number;
  planningModel?: string;
  planVersion?: number | null;
  taskCount?: number | null;
  estimatedEffortHours?: number | null;
  actualEffortHours?: number | null;
  estimatedCostUsd?: number | null;
  actualCostUsd?: number | null;
  dependencyCount?: number | null;
  riskScore?: number | null;
  planContent?: unknown;
}): Promise<{ id: number }> {
  const db = getDb();

  // Validate planning model if provided, using allowed list to prevent SQL injection via dynamic identifiers
  if (params.planningModel && params.planningModel.length === 0) {
    throw new Error('planningModel cannot be empty');
  }

  const stmt = db.prepare(`
    INSERT INTO planning_history (feature_id, planning_model, plan_version, task_count, estimated_effort_hours, actual_effort_hours, estimated_cost_usd, actual_cost_usd, dependency_count, risk_score, plan_content)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const result = stmt.run(
    params.featureId ?? null,
    sqlNullable(params.planningModel),
    params.planVersion ?? null,
    params.taskCount ?? null,
    params.estimatedEffortHours ?? null,
    params.actualEffortHours ?? null,
    params.estimatedCostUsd ?? null,
    params.actualCostUsd ?? null,
    params.dependencyCount ?? null,
    params.riskScore ?? null,
    sqlJsonString(params.planContent)
  );

  return { id: result.lastInsertRowid as number };
}

/** Get planning history */
export async function getPlanningHistory(): Promise<Record<string, unknown>[]> {
  const db = getDb();
  return db.prepare('SELECT * FROM planning_history ORDER BY created_at DESC').all() as Record<string, unknown>[];
}
