import { afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { closeDatabase, initDatabase } from '../db/connection.js';
import { createErrorPattern, getErrorPatterns } from '../db/queries.js';

function tempDbPath(): string {
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'dev-loop-order-')), 'test.sqlite');
}

afterEach(() => {
  closeDatabase();
});

describe('getErrorPatterns orderBy', () => {
  it('rejects unsafe orderBy values', async () => {
    initDatabase(tempDbPath());

    await expect(
      getErrorPatterns({ orderBy: 'seen_count DESC; DROP TABLE loop_history; --' })
    ).rejects.toThrow(/Invalid orderBy/);
  });

  it('allows known sort fields and directions', async () => {
    initDatabase(tempDbPath());

    await createErrorPattern({
      patternHash: 'hash-b',
      model: 'b-model',
      featureKeywords: ['api'],
      errorDescription: 'b',
      fixDescription: 'b',
    });
    await createErrorPattern({
      patternHash: 'hash-a',
      model: 'a-model',
      featureKeywords: ['api'],
      errorDescription: 'a',
      fixDescription: 'a',
    });

    const rows = await getErrorPatterns({ orderBy: 'model', orderDirection: 'asc' });

    expect(rows.map((row) => row.model)).toEqual(['a-model', 'b-model']);
  });
});
