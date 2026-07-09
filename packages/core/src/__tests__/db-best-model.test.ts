import { afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { closeDatabase, initDatabase } from '../db/connection.js';
import { getBestModelForFeatureType, updateModelProfile } from '../db/queries.js';

function tempDbPath(): string {
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'dev-loop-best-model-')), 'test.sqlite');
}

afterEach(() => {
  closeDatabase();
});

describe('getBestModelForFeatureType', () => {
  it('does not require a model_pricing table for best model lookup', async () => {
    initDatabase(tempDbPath());

    for (let i = 0; i < 5; i += 1) {
      await updateModelProfile({
        model: 'local-qwen',
        provider: 'ollama',
        featureType: 'api',
        successRate: 0.9,
      });
    }

    await expect(
      getBestModelForFeatureType({ featureType: 'api', maxCostPer1kTokens: 0.002 })
    ).resolves.toMatchObject({ model: 'local-qwen', provider: 'ollama' });
  });
});
