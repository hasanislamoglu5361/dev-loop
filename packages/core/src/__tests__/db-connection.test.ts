import { afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { closeDatabase, getDatabase, initDatabase, resetDatabaseForTests } from '../db/connection.js';

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
});
