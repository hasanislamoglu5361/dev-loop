import { afterEach, describe, expect, it } from 'vitest';
import crypto from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { closeDatabase, getDatabase, initDatabase } from '../db/connection.js';
import {
  countRecentFailures,
  createLoop,
  createLoopTurn,
  getLoopTurns,
  saveLoopTurnError,
  updateLoopTurn,
} from '../db/queries.js';

function createTempDatabaseForTest(): string {
  return path.join(os.tmpdir(), `dev-loop-feature027-${crypto.randomUUID()}.db`);
}

afterEach(() => {
  closeDatabase();
});

describe('FEATURE027 - loop turn query helpers', () => {
  it('stores successful and failed turns in turn number order with JSON arrays', async () => {
    initDatabase(createTempDatabaseForTest());

    const loop = await createLoop('feature-turns', { featureType: 'api', primaryModel: 'qwen' });
    await createLoopTurn({
      loopId: loop.id,
      turnNumber: 2,
      agent: 'verifier',
      model: 'claude',
      success: false,
      filesChanged: ['src/b.ts'],
      mcpServersUsed: ['filesystem'],
    });
    await createLoopTurn({
      loopId: loop.id,
      turnNumber: 1,
      agent: 'primary',
      model: 'qwen',
      inputTokens: 0,
      outputTokens: 0,
      costUsd: 0,
      durationSeconds: 0,
      success: true,
      filesChanged: [],
      mcpServersUsed: [],
    });

    const turns = await getLoopTurns(loop.id);
    expect(turns.map(turn => turn.turn_number)).toEqual([1, 2]);
    expect(turns[0]).toMatchObject({
      success: 1,
      input_tokens: 0,
      output_tokens: 0,
      cost_usd: 0,
      duration_seconds: 0,
      files_changed: '[]',
      mcp_servers_used: '[]',
    });
    expect(turns[1]).toMatchObject({
      success: 0,
      files_changed: '["src/b.ts"]',
      mcp_servers_used: '["filesystem"]',
    });
  });

  it('updates turns and records failures without losing false values', async () => {
    initDatabase(createTempDatabaseForTest());

    const loop = await createLoop('feature-error', { featureType: 'api', primaryModel: 'qwen' });
    const turn = await createLoopTurn({
      loopId: loop.id,
      turnNumber: 1,
      agent: 'primary',
      model: 'qwen',
      success: true,
    });

    await updateLoopTurn(turn.id, {
      success: false,
      inputTokens: 0,
      outputTokens: 0,
      costUsd: 0,
      filesChanged: ['src/index.ts', 'src/query.ts'],
      mcpServersUsed: ['filesystem', 'sqlite'],
    });
    await saveLoopTurnError(turn.id, {
      message: 'Model returned invalid patch',
      type: 'patch_error',
    });

    const [row] = await getLoopTurns(loop.id);
    expect(row).toMatchObject({
      success: 0,
      input_tokens: 0,
      output_tokens: 0,
      cost_usd: 0,
      error_message: 'Model returned invalid patch',
      error_type: 'patch_error',
      files_changed: '["src/index.ts","src/query.ts"]',
      mcp_servers_used: '["filesystem","sqlite"]',
    });
    expect(() => JSON.parse(String(row.files_changed))).not.toThrow();
    expect(() => JSON.parse(String(row.mcp_servers_used))).not.toThrow();
  });

  it('counts recent failures with and without feature type', async () => {
    initDatabase(createTempDatabaseForTest());

    const oldApi = await createLoop('old-api', { featureType: 'api' });
    const recentApiFailure = await createLoop('recent-api-failure', { featureType: 'api' });
    const recentUiFailure = await createLoop('recent-ui-failure', { featureType: 'ui' });
    const recentApiSuccess = await createLoop('recent-api-success', { featureType: 'api' });

    await createLoopTurn({ loopId: oldApi.id, turnNumber: 1, agent: 'primary', model: 'qwen', success: false });
    await createLoopTurn({
      loopId: recentApiFailure.id,
      turnNumber: 1,
      agent: 'primary',
      model: 'qwen',
      success: false,
    });
    await createLoopTurn({
      loopId: recentUiFailure.id,
      turnNumber: 1,
      agent: 'primary',
      model: 'qwen',
      success: false,
    });
    await createLoopTurn({
      loopId: recentApiSuccess.id,
      turnNumber: 1,
      agent: 'primary',
      model: 'qwen',
      success: true,
    });

    const db = getDatabase();
    db.prepare('UPDATE loop_history SET created_at = ? WHERE id = ?').run('2026-07-01T10:00:00.000Z', oldApi.id);
    db.prepare('UPDATE loop_history SET created_at = ? WHERE id = ?').run(
      '2026-07-02T10:00:00.000Z',
      recentApiFailure.id,
    );
    db.prepare('UPDATE loop_history SET created_at = ? WHERE id = ?').run(
      '2026-07-03T10:00:00.000Z',
      recentUiFailure.id,
    );
    db.prepare('UPDATE loop_history SET created_at = ? WHERE id = ?').run(
      '2026-07-04T10:00:00.000Z',
      recentApiSuccess.id,
    );

    await expect(countRecentFailures('qwen')).resolves.toBe(3);
    await expect(countRecentFailures('qwen', { withinLoops: 2 })).resolves.toBe(1);
    await expect(countRecentFailures('qwen', { featureType: 'api' })).resolves.toBe(2);
    await expect(countRecentFailures('qwen', { featureType: 'api', withinLoops: 2 })).resolves.toBe(1);
  });

  it('rejects unsafe update keys instead of interpolating them into SQL', async () => {
    initDatabase(createTempDatabaseForTest());

    const loop = await createLoop('feature-turn-unsafe');
    const turn = await createLoopTurn({ loopId: loop.id, turnNumber: 1, agent: 'primary' });

    await expect(
      updateLoopTurn(turn.id, { 'success = 1 WHERE 1 = 1 --': true } as never),
    ).rejects.toThrow(/Unsupported loop turn update field/);
  });
});
