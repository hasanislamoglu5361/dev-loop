// packages/core/src/db/queries/mcp.ts
// MCP usage query helpers for dev-loop SQLite database.
// Query helpers currently use better-sqlite3 directly.

import { getDb } from './db.js';
import { sqlBoolean, sqlNullable, sqlJsonString } from './sql-values.js';

export interface SaveMcpUsageParams {
  loopId: number;
  turnId?: number;
  model?: string;
  mcpServer: string;
  toolName: string;
  inputSummary?: string;
  outputSummary?: string;
  success?: boolean;
  wasNecessary?: boolean;
  couldHavePreventedError?: boolean;
  durationMs?: number;
}

export interface SaveMcpErrorParams {
  loopId: number;
  turnId?: number;
  model?: string;
  mcpServer: string;
  toolName: string;
  errorType?: string;
  errorMessage?: string;
  inputSummary?: string;
}

/** Save an MCP usage record */
export async function saveMcpUsage(params: SaveMcpUsageParams): Promise<{ id: number }> {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO mcp_usage (
      loop_id, turn_id, model, mcp_server, tool_name, input_summary, output_summary,
      success, was_necessary, could_have_prevented_error, duration_ms
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const result = stmt.run(
    params.loopId,
    params.turnId ?? null,
    sqlNullable(params.model),
    params.mcpServer,
    params.toolName,
    sqlNullable(params.inputSummary),
    sqlNullable(params.outputSummary),
    sqlBoolean(params.success ?? true),
    sqlBoolean(params.wasNecessary),
    sqlBoolean(params.couldHavePreventedError ?? false),
    params.durationMs ?? null
  );

  return { id: result.lastInsertRowid as number };
}

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

/** Save an MCP error record */
export async function saveMcpError(params: SaveMcpErrorParams): Promise<{ id: number }> {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO mcp_errors (
      loop_id, turn_id, model, mcp_server, tool_name, error_type, error_message, input_summary
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const result = stmt.run(
    params.loopId,
    params.turnId ?? null,
    sqlNullable(params.model),
    params.mcpServer,
    params.toolName,
    sqlNullable(params.errorType),
    sqlNullable(params.errorMessage),
    sqlNullable(params.inputSummary)
  );

  return { id: result.lastInsertRowid as number };
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
export async function getMcpScores(options?: { loopId?: number; model?: string }): Promise<Record<string, unknown>[]> {
  const db = getDb();

  let sql = 'SELECT * FROM mcp_scores WHERE 1=1';
  const params: unknown[] = [];

  if (options?.loopId) {
    sql += ` AND loop_id = ?`;
    params.push(options.loopId);
  }

  if (options?.model) {
    sql += ` AND model = ?`;
    params.push(options.model);
  }

  sql += ` ORDER BY created_at DESC, id DESC`;
  return db.prepare(sql).all(...params) as Record<string, unknown>[];
}
