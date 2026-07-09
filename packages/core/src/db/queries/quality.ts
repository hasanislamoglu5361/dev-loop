// packages/core/src/db/queries/quality.ts
// Quality history query helpers for dev-loop SQLite database.
// Query helpers currently use better-sqlite3 directly.

import { getDb } from './db.js';
import { sqlBoolean } from './sql-values.js';

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
    metrics.testCoveragePct ?? null,
    metrics.complexityScore ?? null,
    metrics.typeCoveragePct ?? null,
    metrics.mutationScore ?? null,
    metrics.secretsFound ?? 0,
    metrics.vulnerabilitiesCritical ?? 0,
    metrics.vulnerabilitiesHigh ?? 0,
    metrics.deadCodeCount ?? 0,
    metrics.duplicateCodePct ?? null,
    metrics.techDebtMinutes ?? null,
    metrics.lintErrors ?? 0,
    sqlBoolean(metrics.gatePassed) ?? 0
  );

  return { id: result.lastInsertRowid as number };
}

/** Get quality history by loop */
export async function getQualityHistory(options?: { loopId?: number }): Promise<Record<string, unknown>[]> {
  const db = getDb();

  let sql = 'SELECT * FROM quality_history WHERE 1=1';
  const params: unknown[] = [];

  if (options?.loopId) {
    sql += ` AND loop_id = ?`;
    params.push(options.loopId);
  }

  return db.prepare(sql).all(...params) as Record<string, unknown>[];
}

/** Get quality history by date range */
export async function getQualityHistoryByDateRange(
  from: string,
  to: string
): Promise<Record<string, unknown>[]> {
  const db = getDb();
  return db.prepare(`
    SELECT * FROM quality_history
    WHERE created_at BETWEEN ? AND ?
    ORDER BY created_at DESC
  `).all(from, to) as Record<string, unknown>[];
}

/** Get latest quality record */
export async function getLatestQuality(): Promise<Record<string, unknown> | null> {
  const db = getDb();
  return db.prepare('SELECT * FROM quality_history ORDER BY created_at DESC LIMIT 1').get() as Record<string, unknown> | null;
}

/** Update quality history record */
export async function updateQualityHistory(id: number, updates: Partial<Record<string, unknown>>): Promise<void> {
  const db = getDb();

  const fields: string[] = [];
  const values: unknown[] = [];

  if (updates.test_coverage_pct !== undefined) {
    fields.push('test_coverage_pct = ?');
    values.push(updates.test_coverage_pct);
  }
  if (updates.lint_errors !== undefined) {
    fields.push('lint_errors = ?');
    values.push(updates.lint_errors);
  }
  if (updates.code_smells !== undefined) {
    fields.push('code_smells = ?');
    values.push(updates.code_smells);
  }
  if (updates.cyclomatic_complexity !== undefined) {
    fields.push('cyclomatic_complexity = ?');
    values.push(updates.cyclomatic_complexity);
  }
  if (updates.avg_function_length !== undefined) {
    fields.push('avg_function_length = ?');
    values.push(updates.avg_function_length);
  }
  if (updates.architecture_documentation !== undefined) {
    fields.push('architecture_documentation = ?');
    values.push(updates.architecture_documentation);
  }
  if (updates.test_documentation !== undefined) {
    fields.push('test_documentation = ?');
    values.push(updates.test_documentation);
  }

  if (fields.length === 0) return;

  values.push(id);
  db.prepare(`UPDATE quality_history SET ${fields.join(', ')} WHERE id = ?`).run(...values);
}
