// packages/core/src/db/queries/flaky-tests.ts
// Flaky test query helpers for dev-loop SQLite database.
// Query helpers currently use better-sqlite3 directly.

import { getDb } from './db.js';
import { sqlNullable } from './sql-values.js';

/** Upsert flaky test */
export async function upsertFlakyTest(params: { testName: string; testFile?: string; passed: boolean }): Promise<void> {
  const db = getDb();

  // Validate test name and file against allowed characters to prevent SQL injection via dynamic identifiers
  if (!/^[a-zA-Z0-9_\-./]+$/.test(params.testName)) {
    throw new Error(`Invalid test name: ${params.testName}`);
  }

  // Check if exists
  let existing = db.prepare('SELECT id FROM flaky_tests WHERE test_name = ?').get(
    params.testName
  ) as { id: number } | undefined;

  if (existing) {
    // Update counts - use parameterized value updates, not dynamic column names for count fields
    const field = params.passed ? 'pass_count' : 'fail_count';
    db.prepare(`UPDATE flaky_tests SET ${field} = ${field} + 1 WHERE test_name = ?`).run(
      params.testName
    );
  } else {
    // Insert new
    db.prepare(`
      INSERT INTO flaky_tests (test_name, test_file, pass_count, fail_count)
      VALUES (?, ?, ?, ?)
    `).run(
      params.testName,
      sqlNullable(params.testFile),
      params.passed ? 1 : 0,
      params.passed ? 0 : 1
    );
  }

  // Recalculate flaky rate
  const test = db.prepare('SELECT pass_count, fail_count FROM flaky_tests WHERE test_name = ?').get(
    params.testName
  ) as { pass_count: number; fail_count: number } | undefined;

  if (test) {
    const total = test.pass_count + test.fail_count;
    if (total > 0) {
      const flakyRate = Math.min(test.pass_count, test.fail_count) / total;
      db.prepare('UPDATE flaky_tests SET flaky_rate = ?, last_seen = ? WHERE test_name = ?').run(
        flakyRate,
        new Date().toISOString(),
        params.testName
      );

      // Mark as flaky if rate > 10% and < 90%
      if (flakyRate > 0.1 && flakyRate < 0.9) {
        db.prepare('UPDATE flaky_tests SET resolved = 0 WHERE test_name = ?').run(
          params.testName
        );
      }
    }
  }
}

/** Get all flaky tests */
export async function getFlakyTests(): Promise<Record<string, unknown>[]> {
  const db = getDb();
  return db.prepare('SELECT * FROM flaky_tests ORDER BY last_seen DESC').all() as Record<string, unknown>[];
}