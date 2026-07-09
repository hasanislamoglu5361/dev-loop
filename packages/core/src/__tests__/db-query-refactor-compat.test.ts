import { afterEach, describe, expect, it } from 'vitest';
import { closeDatabase, initDatabase } from '../db/connection.js';
import * as oldQueries from '../db/queries.js';
import * as newQueries from '../db/queries/index.js';
import { createTempDatabasePath } from './helpers/database.js';

afterEach(() => {
  closeDatabase();
});

describe('database query refactor compatibility', () => {
  it('keeps the compatibility barrel wired to the split query index', () => {
    expect(newQueries.createLoop).toBe(oldQueries.createLoop);
    expect(newQueries.updateLoop).toBe(oldQueries.updateLoop);
    expect(newQueries.getBestModelForFeatureType).toBe(oldQueries.getBestModelForFeatureType);
    expect(newQueries.saveTicket).toBe(oldQueries.saveTicket);
    expect(newQueries.logNotification).toBe(oldQueries.logNotification);
  });

  it('preserves zero and false values in loop turns', async () => {
    initDatabase(createTempDatabasePath());

    const loop = await oldQueries.createLoop('feature-1');
    const turn = await oldQueries.createLoopTurn({
      loopId: loop.id,
      turnNumber: 1,
      agent: 'tester',
      inputTokens: 0,
      outputTokens: 0,
      costUsd: 0,
      durationSeconds: 0,
      success: false,
      uncertainTagsAdded: 0,
    });

    const [row] = await oldQueries.getLoopTurns(loop.id);
    expect(row).toMatchObject({
      id: turn.id,
      input_tokens: 0,
      output_tokens: 0,
      cost_usd: 0,
      duration_seconds: 0,
      success: 0,
      uncertain_tags_added: 0,
    });
  });

  it('rejects unsupported loop turn update columns', async () => {
    initDatabase(createTempDatabasePath());

    await expect(
      oldQueries.updateLoopTurn(1, { 'success = 1 WHERE 1 = 1 --': true })
    ).rejects.toThrow(/Unsupported loop turn update field/);
  });
});
