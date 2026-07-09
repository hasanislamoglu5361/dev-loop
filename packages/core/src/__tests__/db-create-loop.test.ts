import { afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { closeDatabase, initDatabase, resetDatabaseForTests } from '../db/connection.js';
import { createLoop, getLoopDetail } from '../db/queries.js';

function tempDbPath(): string {
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'dev-loop-create-')), 'test.sqlite');
}

afterEach(() => {
  closeDatabase();
});

describe('createLoop', () => {
  it('stores createLoop options', async () => {
    initDatabase(tempDbPath());

    const { id } = await createLoop('feature-1', {
      primaryModel: 'deepseek-r1',
      verifierModel: 'claude-code',
      fallbackUsed: false,
    });

    const row = await getLoopDetail(id);
    expect(row).toMatchObject({
      feature_id: 'feature-1',
      primary_model: 'deepseek-r1',
      verifier_model: 'claude-code',
      fallback_used: 0,
    });
  });

  it('throws an actionable error when DB is not initialized', async () => {
    resetDatabaseForTests();

    await expect(createLoop('feature-1')).rejects.toThrow(/initDatabase/i);
  });
});
