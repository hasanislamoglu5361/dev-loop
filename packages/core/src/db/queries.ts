// packages/core/src/db/queries.ts — COMPATIBILITY RE-EXPORT ONLY
// This file is a barrel re-export. The actual implementations live in:
//   packages/core/src/db/queries/loop-history.ts
//   packages/core/src/db/queries/loop-turns.ts
//   packages/core/src/db/queries/learning-patterns.ts
//   packages/core/src/db/queries/mcp.ts
//   packages/core/src/db/queries/quality.ts
//   packages/core/src/db/queries/model-profiles.ts
//   packages/core/src/db/queries/tickets.ts
//   packages/core/src/db/queries/notifications.ts
//   packages/core/src/db/queries/planning.ts
//   packages/core/src/db/queries/flaky-tests.ts
//   packages/core/src/db/queries/analytics.ts
//   packages/core/src/db/queries/maintenance.ts
// Query helpers currently use better-sqlite3 directly.

export * from './queries/index.js';
