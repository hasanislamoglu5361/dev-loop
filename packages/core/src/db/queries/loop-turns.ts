// packages/core/src/db/queries/loop-turns.ts
// Loop turns query helpers for dev-loop SQLite database.
// Query helpers currently use better-sqlite3 directly.
// Keep SQL identifiers allow-listed because only values can be parameterized.

import { getDb } from './db.js';
import { sqlBoolean, sqlNullable, sqlJsonString } from './sql-values.js';
import { buildUpdate } from './updates.js';

const LOOP_TURN_UPDATE_COLUMNS = {
  model: 'model',
  inputTokens: 'input_tokens',
  outputTokens: 'output_tokens',
  costUsd: 'cost_usd',
  durationSeconds: 'duration_seconds',
  success: 'success',
  errorMessage: 'error_message',
  errorType: 'error_type',
  diffSizeLines: 'diff_size_lines',
  filesChanged: 'files_changed',
  uncertainTagsAdded: 'uncertain_tags_added',
  mcpServersUsed: 'mcp_servers_used',
} as const;

/** Create a new loop turn record */
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
    sqlNullable(params.model),
    sqlNullable(params.inputTokens),
    sqlNullable(params.outputTokens),
    sqlNullable(params.costUsd),
    sqlNullable(params.durationSeconds),
    sqlBoolean(params.success),
    sqlNullable(params.errorMessage),
    sqlNullable(params.errorType),
    sqlNullable(params.diffSizeLines),
    sqlJsonString(params.filesChanged),
    params.uncertainTagsAdded ?? null,
    sqlJsonString(params.mcpServersUsed)
  );

  return { id: result.lastInsertRowid as number };
}

/** Update a loop turn with allow-listed fields */
export async function updateLoopTurn(
  id: number,
  updates: Partial<Record<string, unknown>>
): Promise<void> {
  const db = getDb();

  const updateResult = buildUpdate(updates, LOOP_TURN_UPDATE_COLUMNS, {
    errorLabel: 'loop turn update',
    serialize: (key, value) => {
      if (key === 'success') return Number(value);
      if (key === 'filesChanged' || key === 'mcpServersUsed') return sqlJsonString(value);
      return value;
    },
  });
  if (!updateResult) return;

  const values = [...updateResult.values, id];
  const sql = `UPDATE loop_turns SET ${updateResult.setSql} WHERE id = ?`;
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
