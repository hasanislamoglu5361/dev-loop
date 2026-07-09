import { describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import { runMigrations } from '../db/migrations.js';

describe('database migrations', () => {
  it('tracks migrations by explicit version and name', () => {
    const db = new Database(':memory:');
    runMigrations(db);

    const rows = db.prepare('SELECT version, name FROM _migrations').all();

    expect(rows).toContainEqual({ version: 1, name: '001_initial_schema' });
    db.close();
  });

  it('does not reapply an already applied migration', () => {
    const db = new Database(':memory:');

    runMigrations(db);
    runMigrations(db);

    const row = db.prepare(`
      SELECT COUNT(*) as count FROM _migrations WHERE name = ?
    `).get('001_initial_schema') as { count: number };

    expect(row.count).toBe(1);
    db.close();
  });
});
