import { afterEach, describe, expect, it } from 'vitest';
import crypto from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { closeDatabase, initDatabase } from '../db/connection.js';
import {
  createLoop,
  createLoopTurn,
  getLoopTurns,
  getQualityHistory,
  getUnresolvedUncertainTags,
  saveQualityHistory,
  saveUncertainTags,
} from '../db/queries.js';

function createTempDatabaseForTest(): string {
  return path.join(os.tmpdir(), `dev-loop-${crypto.randomUUID()}.db`);
}

afterEach(() => {
  closeDatabase();
});

describe('query integration smoke test', () => {
  it('supports loop, turn, uncertain tag, and quality flows', async () => {
    initDatabase(createTempDatabaseForTest());

    const loop = await createLoop('feature-1', { primaryModel: 'qwen' });
    await createLoopTurn({ loopId: loop.id, turnNumber: 1, agent: 'primary', success: false });
    await saveUncertainTags(loop.id, [{ file: 'src/a.ts', line: 1, note: 'needs review' }]);
    await saveQualityHistory(loop.id, { gatePassed: false, lintErrors: 1 });

    expect(await getLoopTurns(loop.id)).toHaveLength(1);
    expect(await getUnresolvedUncertainTags(loop.id)).toHaveLength(1);
    expect(await getQualityHistory()).toEqual([
      expect.objectContaining({ loop_id: loop.id, gate_passed: 0, lint_errors: 1 }),
    ]);
  });
});
