// packages/core/src/db/queries/index.ts
// Barrel file for domain-specific query modules.
// This module re-exports all functions from sub-modules so that callers can use:
//   import { createLoop, ... } from '../db/queries.js';
// while the actual implementations live in focused files under queries/.

export * from './loop-history.js';
export * from './loop-turns.js';
export * from './learning-patterns.js';
export * from './mcp.js';
export * from './quality.js';
export * from './model-profiles.js';
export * from './tickets.js';
export * from './notifications.js';
export * from './planning.js';
export * from './flaky-tests.js';
export * from './analytics.js';
export * from './audit.js';
export * from './maintenance.js';

// Re-export shared helpers for internal use and tests that may import them directly
export { getDb } from './db.js';
export { normalizeSqlValue, sqlNullable, sqlBoolean, sqlJsonString, toSqlSafe } from './sql-values.js';
export { buildUpdate, type UpdateColumnMap } from './updates.js';
