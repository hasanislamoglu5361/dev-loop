import { afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  closeDatabase,
  getDatabase,
  getDrizzleDatabase,
  initDatabase,
  resetDatabaseForTests,
} from '../db/connection.js';
import { loopHistory } from '../db/schema.js';

function tempDbPath(): string {
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'dev-loop-db-')), 'test.sqlite');
}

afterEach(() => {
  resetDatabaseForTests();
});

describe('database connection lifecycle', () => {
  it('initializes, retrieves, and closes a SQLite connection', () => {
    const db = initDatabase(tempDbPath());

    expect(db.open).toBe(true);
    expect(getDatabase()).toBe(db);

    closeDatabase();
    expect(db.open).toBe(false);
  });

  it('throws before initialization', () => {
    expect(() => getDatabase()).toThrow('Database is not initialized');
  });

  it('creates a DB file on disk', () => {
    const dbPath = tempDbPath();
    expect(fs.existsSync(dbPath)).toBe(false);

    initDatabase(dbPath);

    expect(fs.existsSync(dbPath)).toBe(true);
  });

  it('enables the foreign_keys pragma', () => {
    initDatabase(tempDbPath());

    const row = getDatabase().pragma('foreign_keys', { simple: true });

    expect(row).toBe(1);
  });

  it('can call close twice safely', () => {
    initDatabase(tempDbPath());

    expect(() => {
      closeDatabase();
      closeDatabase();
    }).not.toThrow();
  });

  it('provides a real Drizzle DB instance backed by the same connection', () => {
    initDatabase(tempDbPath());

    const drizzleDb = getDrizzleDatabase();
    const rows = drizzleDb.select().from(loopHistory).all();

    expect(rows).toEqual([]);
  });

  it('throws requesting the Drizzle instance before initialization', () => {
    expect(() => getDrizzleDatabase()).toThrow('Database is not initialized');
  });
});
