import { describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import { applyMigrationSet, runMigrations } from '../db/migrations.js';

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

  it('does not close a caller-owned database connection', () => {
    const db = new Database(':memory:');

    runMigrations(db);

    expect(db.open).toBe(true);
    db.close();
  });

  it('rolls back all changes and does not record a migration that throws mid-transaction', () => {
    const db = new Database(':memory:');
    runMigrations(db);

    expect(() => {
      applyMigrationSet(db, [
        {
          version: 999,
          name: '999_simulated_failure',
          up: failingDb => {
            failingDb.exec('CREATE TABLE partial_table (id INTEGER)');
            throw new Error('simulated migration failure');
          },
        },
      ]);
    }).toThrow('simulated migration failure');

    const partialTable = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='partial_table'")
      .get();
    expect(partialTable).toBeUndefined();

    const migrationRow = db
      .prepare('SELECT 1 FROM _migrations WHERE version = ?')
      .get(999);
    expect(migrationRow).toBeUndefined();

    db.close();
  });
});
