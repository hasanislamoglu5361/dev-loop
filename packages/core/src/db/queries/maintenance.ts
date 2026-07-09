// packages/core/src/db/queries/maintenance.ts
// Database maintenance query helpers for dev-loop SQLite database.
// Query helpers currently use better-sqlite3 directly.

import { getDb } from './db.js';

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

  // Count tables - use hardcoded count query to prevent SQL injection via PRAGMA fields
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