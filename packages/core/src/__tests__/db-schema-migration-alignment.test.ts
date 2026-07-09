import { describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import { runMigrations } from '../db/migrations.js';

function migratedDb(): Database.Database {
  const db = new Database(':memory:');
  runMigrations(db);
  return db;
}

describe('schema and migration alignment', () => {
  it('creates columns used by the Drizzle schema', () => {
    const db = migratedDb();
    const columns = (db.prepare('PRAGMA table_info(loop_turns)').all() as Array<{ name: string }>)
      .map((row) => row.name);

    expect(columns).toEqual(expect.arrayContaining([
      'loop_id',
      'turn_number',
      'agent',
      'input_tokens',
      'output_tokens',
      'created_at',
    ]));
    db.close();
  });

  it('creates prompt-critical indexes', () => {
    const db = migratedDb();
    const indexes = (db.prepare("PRAGMA index_list('loop_history')").all() as Array<{ name: string }>)
      .map((row) => row.name);

    expect(indexes).toContain('idx_loop_history_created');
    db.close();
  });

  it('does not create an unowned model_pricing table', () => {
    const db = migratedDb();
    const row = db.prepare(`
      SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'model_pricing'
    `).get();

    expect(row).toBeUndefined();
    db.close();
  });
});
