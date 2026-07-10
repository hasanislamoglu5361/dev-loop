import { afterEach, describe, expect, it } from 'vitest';
import crypto from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { closeDatabase, getDatabase, initDatabase } from '../db/connection.js';
import {
  completeLoop,
  createLoop,
  failLoop,
  getLoopDetail,
  getLoopsByDateRange,
  getLoopsByModel,
  getRecentLoops,
  updateLoop,
} from '../db/queries.js';

function createTempDatabaseForTest(): string {
  return path.join(os.tmpdir(), `dev-loop-feature026-${crypto.randomUUID()}.db`);
}

afterEach(() => {
  closeDatabase();
});

describe('FEATURE026 - loop history query helpers', () => {
  it('creates and updates all important loop history fields using camelCase API keys', async () => {
    initDatabase(createTempDatabaseForTest());

    const { id } = await createLoop('feature-026', {
      featureSummary: 'Loop query helpers',
      featureKeywords: 'db,queries',
      featureType: 'database',
      language: 'typescript',
      primaryModel: 'qwen',
      primaryProvider: 'ollama',
      verifierModel: 'claude',
      verifierProvider: 'anthropic',
      fallbackUsed: false,
      fallbackModel: 'gpt-4.1',
      planningLoopId: 0,
    });

    await updateLoop(id, {
      fallbackUsed: true,
      totalTurns: 0,
      success: false,
      durationSeconds: 0,
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalCostUsd: 0,
      commitHash: 'abc123',
      branchName: 'feature/026',
      prUrl: 'https://example.test/pr/26',
      qualityGatePassed: false,
      testCoveragePct: 0,
      uncertainTagsFound: 0,
      uncertainTagsResolved: 0,
      userRating: 0,
    });

    const row = await getLoopDetail(id);
    expect(row).toMatchObject({
      feature_id: 'feature-026',
      feature_summary: 'Loop query helpers',
      feature_keywords: 'db,queries',
      feature_type: 'database',
      language: 'typescript',
      primary_model: 'qwen',
      primary_provider: 'ollama',
      verifier_model: 'claude',
      verifier_provider: 'anthropic',
      fallback_used: 1,
      fallback_model: 'gpt-4.1',
      total_turns: 0,
      success: 0,
      duration_seconds: 0,
      total_input_tokens: 0,
      total_output_tokens: 0,
      total_cost_usd: 0,
      commit_hash: 'abc123',
      branch_name: 'feature/026',
      pr_url: 'https://example.test/pr/26',
      quality_gate_passed: 0,
      test_coverage_pct: 0,
      uncertain_tags_found: 0,
      uncertain_tags_resolved: 0,
      user_rating: 0,
      planning_loop_id: 0,
    });

    const dbRow = getDatabase()
      .prepare('SELECT primary_model, total_cost_usd, quality_gate_passed FROM loop_history WHERE id = ?')
      .get(id);
    expect(dbRow).toEqual({
      primary_model: 'qwen',
      total_cost_usd: 0,
      quality_gate_passed: 0,
    });
  });

  it('completes and fails loops through lifecycle helpers', async () => {
    initDatabase(createTempDatabaseForTest());

    const completed = await createLoop('feature-complete', { primaryModel: 'qwen' });
    await completeLoop(completed.id, {
      totalTurns: 2,
      durationSeconds: 12.5,
      totalInputTokens: 10,
      totalOutputTokens: 5,
      totalCostUsd: 0,
      qualityGatePassed: true,
      testCoveragePct: 88.5,
    });

    await expect(getLoopDetail(completed.id)).resolves.toMatchObject({
      success: 1,
      total_turns: 2,
      total_cost_usd: 0,
      quality_gate_passed: 1,
      test_coverage_pct: 88.5,
    });

    const failed = await createLoop('feature-fail', { primaryModel: 'claude' });
    await failLoop(failed.id, {
      reason: 'tests failed',
      bugs: [{ file: 'src/index.ts', description: 'Unhandled branch' }],
    });

    await expect(getLoopDetail(failed.id)).resolves.toMatchObject({
      success: 0,
      failure_reason: 'tests failed',
    });

    const uncertainTag = getDatabase()
      .prepare('SELECT loop_id, file_path, model_note FROM uncertain_tags WHERE loop_id = ?')
      .get(failed.id);
    expect(uncertainTag).toEqual({
      loop_id: failed.id,
      file_path: 'src/index.ts',
      model_note: 'Unhandled branch',
    });
  });

  it('retrieves recent loops by model and date range', async () => {
    initDatabase(createTempDatabaseForTest());

    const qwen = await createLoop('feature-qwen', { primaryModel: 'qwen' });
    const claude = await createLoop('feature-claude', { primaryModel: 'claude' });

    getDatabase()
      .prepare('UPDATE loop_history SET created_at = ? WHERE id = ?')
      .run('2026-07-01T10:00:00.000Z', qwen.id);
    getDatabase()
      .prepare('UPDATE loop_history SET created_at = ? WHERE id = ?')
      .run('2026-07-02T10:00:00.000Z', claude.id);

    expect(await getRecentLoops(1)).toEqual([
      expect.objectContaining({ id: claude.id, feature_id: 'feature-claude' }),
    ]);
    expect(await getLoopsByModel('qwen')).toEqual([
      expect.objectContaining({ id: qwen.id, primary_model: 'qwen' }),
    ]);
    expect(await getLoopsByDateRange('2026-07-02T00:00:00.000Z', '2026-07-03T00:00:00.000Z')).toEqual([
      expect.objectContaining({ id: claude.id, feature_id: 'feature-claude' }),
    ]);
  });

  it('rejects unsafe update keys instead of interpolating them into SQL', async () => {
    initDatabase(createTempDatabaseForTest());

    const { id } = await createLoop('feature-unsafe');
    await expect(
      updateLoop(id, { 'success = 1 WHERE 1 = 1 --': true } as never),
    ).rejects.toThrow(/Unsupported loop update field/);
  });
});
