import Database from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import path from 'node:path';
import { runMigrations } from './migrations.js';
import * as schema from './schema.js';

let sqlite: Database.Database | null = null;
let drizzleDb: BetterSQLite3Database<typeof schema> | null = null;

export class DatabaseConnectionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DatabaseConnectionError';
  }
}

export function initDatabase(dbPath: string): Database.Database {
  closeDatabase();

  const absPath = path.resolve(dbPath);
  runMigrations(absPath);

  sqlite = new Database(absPath);
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');
  drizzleDb = drizzle(sqlite, { schema });
  return sqlite;
}

export function getDatabase(): Database.Database {
  if (!sqlite?.open) {
    throw new DatabaseConnectionError('Database is not initialized. Call initDatabase() first.');
  }

  return sqlite;
}

export function getDrizzleDatabase(): BetterSQLite3Database<typeof schema> {
  if (!sqlite?.open || !drizzleDb) {
    throw new DatabaseConnectionError('Database is not initialized. Call initDatabase() first.');
  }

  return drizzleDb;
}

export function closeDatabase(): void {
  if (sqlite?.open) {
    sqlite.close();
  }

  sqlite = null;
  drizzleDb = null;
}

export function resetDatabaseForTests(): void {
  closeDatabase();
}
