import { describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import { runMigrations } from '../db/migrations.js';

function migratedDb(): Database.Database {
  const db = new Database(':memory:');
  runMigrations(db);
  return db;
}

const PROMPT_REQUIRED_TABLES = [
  'loop_history',
  'loop_turns',
  'error_patterns',
  'success_patterns',
  'model_profiles',
  'mcp_usage',
  'mcp_errors',
  'mcp_scores',
  'benchmark_results',
  'quality_history',
  'uncertain_tags',
  'prompt_versions',
  'notification_log',
  'tickets',
  'audit_log',
  'planning_history',
  'db_query_analysis',
  'user_ratings',
  'flaky_tests',
  'golden_files',
];

const PROMPT_REQUIRED_INDEXES: Array<{ table: string; index: string }> = [
  { table: 'loop_history', index: 'idx_loop_history_created' },
  { table: 'loop_history', index: 'idx_loop_history_model' },
  { table: 'loop_history', index: 'idx_loop_history_success' },
  { table: 'error_patterns', index: 'idx_error_patterns_model' },
  { table: 'error_patterns', index: 'idx_error_patterns_hash' },
  { table: 'mcp_usage', index: 'idx_mcp_usage_loop' },
  { table: 'mcp_errors', index: 'idx_mcp_errors_loop' },
  { table: 'benchmark_results', index: 'idx_benchmark_id' },
  { table: 'quality_history', index: 'idx_quality_loop' },
  { table: 'uncertain_tags', index: 'idx_uncertain_loop' },
  { table: 'uncertain_tags', index: 'idx_uncertain_resolved' },
  { table: 'tickets', index: 'idx_tickets_provider' },
];

describe('FEATURE025 - Initial Database Migration Content', () => {
  it('creates every table required by dev-loop-prompt.md section 6', () => {
    const db = migratedDb();
    const tableNames = (db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
      .all() as Array<{ name: string }>).map(row => row.name);

    for (const table of PROMPT_REQUIRED_TABLES) {
      expect(tableNames).toContain(table);
    }

    db.close();
  });

  it('creates the representative performance indexes from dev-loop-prompt.md', () => {
    const db = migratedDb();

    for (const { table, index } of PROMPT_REQUIRED_INDEXES) {
      const indexNames = (db.prepare(`PRAGMA index_list('${table}')`).all() as Array<{ name: string }>)
        .map(row => row.name);
      expect(indexNames).toContain(index);
    }

    db.close();
  });

  it('cascades loop_history deletion to dependent loop_turns rows', () => {
    const db = migratedDb();

    const loopId = (db
      .prepare("INSERT INTO loop_history (feature_id) VALUES ('feature-1')")
      .run().lastInsertRowid) as number;

    db.prepare(`
      INSERT INTO loop_turns (loop_id, turn_number, agent) VALUES (?, 1, 'primary')
    `).run(loopId);

    const beforeDelete = db.prepare('SELECT COUNT(*) AS count FROM loop_turns WHERE loop_id = ?').get(loopId) as { count: number };
    expect(beforeDelete.count).toBe(1);

    db.prepare('DELETE FROM loop_history WHERE id = ?').run(loopId);

    const afterDelete = db.prepare('SELECT COUNT(*) AS count FROM loop_turns WHERE loop_id = ?').get(loopId) as { count: number };
    expect(afterDelete.count).toBe(0);

    db.close();
  });

  it('rejects a duplicate ticket provider/ticket_id pair', () => {
    const db = migratedDb();

    db.prepare("INSERT INTO tickets (provider, ticket_id) VALUES ('jira', 'ABC-1')").run();

    expect(() => {
      db.prepare("INSERT INTO tickets (provider, ticket_id) VALUES ('jira', 'ABC-1')").run();
    }).toThrow();

    db.close();
  });

  it('rejects a user rating outside the 1-5 range', () => {
    const db = migratedDb();

    const loopId = (db
      .prepare("INSERT INTO loop_history (feature_id) VALUES ('feature-1')")
      .run().lastInsertRowid) as number;

    expect(() => {
      db.prepare('INSERT INTO user_ratings (loop_id, rating) VALUES (?, 6)').run(loopId);
    }).toThrow();

    db.close();
  });

  it('defaults created_at to a non-null timestamp matching the schema default', () => {
    const db = migratedDb();

    const loopId = (db
      .prepare("INSERT INTO loop_history (feature_id) VALUES ('feature-1')")
      .run().lastInsertRowid) as number;

    const row = db.prepare('SELECT created_at, total_cost_usd, success FROM loop_history WHERE id = ?').get(loopId) as {
      created_at: string | null;
      total_cost_usd: number;
      success: number;
    };

    expect(row.created_at).toEqual(expect.any(String));
    expect(row.created_at).not.toBe('');
    expect(row.total_cost_usd).toBe(0);
    expect(row.success).toBe(0);

    db.close();
  });
});
