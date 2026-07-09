import { afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { closeDatabase, initDatabase } from '../db/connection.js';
import { createLoop, getLoopDetail, updateLoop } from '../db/queries.js';

function tempDbPath(): string {
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'dev-loop-update-')), 'test.sqlite');
}

afterEach(() => {
  closeDatabase();
});

describe('updateLoop', () => {
  it('maps camelCase fields to snake_case DB columns', async () => {
    initDatabase(tempDbPath());

    const { id } = await createLoop('feature-1');
    await updateLoop(id, {
      primaryModel: 'qwen',
      totalCostUsd: 0.25,
      fallbackUsed: true,
      success: false,
    });

    const row = await getLoopDetail(id);
    expect(row).toMatchObject({
      primary_model: 'qwen',
      total_cost_usd: 0.25,
      fallback_used: 1,
      success: 0,
    });
  });

  it('rejects unknown update fields', async () => {
    initDatabase(tempDbPath());

    const { id } = await createLoop('feature-1');
    await expect(updateLoop(id, { unknownField: 'x' } as never)).rejects.toThrow(
      'Unsupported loop update field'
    );
  });
});
