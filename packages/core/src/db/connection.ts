import Database from 'better-sqlite3';
import path from 'node:path';
import { runMigrations } from './migrations.js';

let sqlite: Database.Database | null = null;

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
  return sqlite;
}

export function getDatabase(): Database.Database {
  if (!sqlite?.open) {
    throw new DatabaseConnectionError('Database is not initialized. Call initDatabase() first.');
  }

  return sqlite;
}

export function closeDatabase(): void {
  if (sqlite?.open) {
    sqlite.close();
  }

  sqlite = null;
}

export function resetDatabaseForTests(): void {
  closeDatabase();
}
