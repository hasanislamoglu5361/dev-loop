// packages/core/src/__tests__/bug039-schema-foreign-keys.test.ts
// Regression test for BUG039: the Drizzle schema declared indexes and unique
// indexes matching the raw migration SQL, but never declared foreign keys,
// even though FEATURE021/FEATURE022 explicitly warned against forgetting them.
// This asserts Drizzle metadata for every table that has a real FOREIGN KEY
// clause in db/migrations.ts.

import { describe, expect, it } from 'vitest';
import { getTableConfig } from 'drizzle-orm/sqlite-core';
import {
  loopTurns,
  mcpErrors,
  mcpScores,
  mcpUsage,
  notificationLog,
  qualityHistory,
  uncertainTags,
  userRatings,
} from '../db/schema.js';

const TABLES_WITH_LOOP_ID_FK = [
  ['loop_turns', loopTurns],
  ['mcp_usage', mcpUsage],
  ['mcp_errors', mcpErrors],
  ['mcp_scores', mcpScores],
  ['quality_history', qualityHistory],
  ['uncertain_tags', uncertainTags],
  ['notification_log', notificationLog],
  ['user_ratings', userRatings],
] as const;

describe('BUG039 - Drizzle schema declares foreign keys matching the migration', () => {
  it.each(TABLES_WITH_LOOP_ID_FK)('declares a loop_id foreign key on %s', (_name, table) => {
    const foreignKeys = getTableConfig(table).foreignKeys;
    expect(foreignKeys.length).toBeGreaterThan(0);

    const referencesLoopHistory = foreignKeys.some(fk => {
      const { foreignTable } = fk.reference();
      return getTableConfig(foreignTable).name === 'loop_history';
    });
    expect(referencesLoopHistory).toBe(true);
  });
});
