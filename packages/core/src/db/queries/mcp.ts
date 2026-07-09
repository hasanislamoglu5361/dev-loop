// packages/core/src/db/queries/mcp.ts
// MCP usage query helpers for dev-loop SQLite database.
// Query helpers currently use better-sqlite3 directly.

import { getDb } from './db.js';
import { sqlNullable, sqlJsonString } from './sql-values.js';

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
    sqlNullable(mcpScore.model),
    sqlJsonString(mcpScore.shouldHaveUsed),
    sqlJsonString(mcpScore.correctlyUsed),
    sqlJsonString(mcpScore.incorrectlyUsed),
    mcpScore.webSearchCount ?? null,
    mcpScore.webSearchSuccess ?? null,
    mcpScore.score,
    sqlNullable(mcpScore.verifierNotes)
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