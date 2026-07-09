import crypto from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { closeDatabase, initDatabase } from '../../db/connection.js';

export function createTempDatabasePath(prefix = 'dev-loop-db-'): string {
  return path.join(os.tmpdir(), `${prefix}${crypto.randomUUID()}.sqlite`);
}

export function initTempDatabase(): string {
  const dbPath = createTempDatabasePath();
  initDatabase(dbPath);
  return dbPath;
}

export function closeTempDatabase(): void {
  closeDatabase();
}
