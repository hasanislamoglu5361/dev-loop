// packages/core/src/db/queries/db.ts
// Database connection accessor for dev-loop query modules.

import type Database from 'better-sqlite3';
import { getDatabase } from '../connection.js';

/** Get a fresh database connection handle. */
export function getDb(): Database.Database {
  return getDatabase();
}
