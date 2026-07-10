import { afterEach, describe, expect, it } from 'vitest';
import crypto from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { closeDatabase, initDatabase } from '../db/connection.js';
import {
  createLoop,
  createPromptVersion,
  getActivePromptVersion,
  getAllBenchmarks,
  getBestModelForFeatureType,
  getFlakyTests,
  getGoldenFile,
  getNotificationLog,
  getPlanningHistory,
  getTicket,
  getUserRatings,
  logNotification,
  rawQuery,
  saveBenchmarkResult,
  saveGoldenFile,
  savePlanningHistory,
  saveTicket,
  saveUserRating,
  updateModelProfile,
  updatePromptVersionStats,
  upsertFlakyTest,
} from '../db/queries.js';

function createTempDatabaseForTest(): string {
  return path.join(os.tmpdir(), `dev-loop-feature030-${crypto.randomUUID()}.db`);
}

afterEach(() => {
  closeDatabase();
});

describe('FEATURE030 - remaining query helpers', () => {
  it('supports benchmark, planning, ticket, notification, rating, flaky, golden, and prompt flows', async () => {
    initDatabase(createTempDatabaseForTest());

    const loop = await createLoop('feature-030', { featureType: 'api', primaryModel: 'qwen' });
    await saveBenchmarkResult({
      benchmark_id: 'bench-1',
      benchmark_name: 'API benchmark',
      model: 'qwen',
      provider: 'ollama',
      success: false,
      turns: 0,
      input_tokens: 0,
      output_tokens: 0,
      cost_usd: 0,
    });
    await savePlanningHistory({
      featureId: 'feature-030',
      planningModel: 'qwen',
      planVersion: 1,
      taskCount: 0,
      estimatedEffortHours: 0,
      planContent: { tasks: [] },
    });
    await saveTicket({
      provider: 'github',
      ticketId: '42',
      title: 'Old title',
      status: 'open',
      loopId: loop.id,
      commentPosted: false,
      injectionDetected: false,
    });
    await saveTicket({
      provider: 'github',
      ticketId: '42',
      title: 'Updated title',
      status: 'closed',
      loopId: loop.id,
      commentPosted: true,
      injectionDetected: false,
    });
    await logNotification({
      channel: 'slack',
      eventType: 'loop.complete',
      message: 'done',
      loopId: loop.id,
      sent: false,
    });
    await saveUserRating({
      loopId: loop.id,
      rating: 5,
      comment: 'useful',
      falsePositive: false,
    });
    await upsertFlakyTest({ testName: 'packages/core/src/foo.test.ts', testFile: 'foo.test.ts', passed: false });
    await upsertFlakyTest({ testName: 'packages/core/src/foo.test.ts', testFile: 'foo.test.ts', passed: true });
    await saveGoldenFile({ filePath: 'snapshots/foo.json', contentHash: 'hash-1' });
    await saveGoldenFile({ filePath: 'snapshots/foo.json', contentHash: 'hash-2' });
    const prompt = await createPromptVersion({
      promptType: 'coding',
      model: 'qwen',
      featureType: 'api',
      version: 'v1',
      content: 'Build the smallest safe fix.',
    });
    await updatePromptVersionStats(prompt.id, {
      successRate: 0,
      avgTurns: 0,
      avgCost: 0,
      sampleCount: 1,
    });

    await expect(getAllBenchmarks()).resolves.toEqual([
      expect.objectContaining({ benchmark_id: 'bench-1', success: 0, cost_usd: 0 }),
    ]);
    await expect(getPlanningHistory()).resolves.toEqual([
      expect.objectContaining({ feature_id: 'feature-030', task_count: 0, plan_content: '{"tasks":[]}' }),
    ]);
    await expect(getTicket('github', '42')).resolves.toMatchObject({
      title: 'Updated title',
      status: 'closed',
      comment_posted: 1,
      injection_detected: 0,
    });
    await expect(getNotificationLog()).resolves.toEqual([
      expect.objectContaining({ channel: 'slack', sent: 0 }),
    ]);
    await expect(getUserRatings({ loopId: loop.id })).resolves.toEqual([
      expect.objectContaining({ rating: 5, false_positive: 0 }),
    ]);
    await expect(getFlakyTests()).resolves.toEqual([
      expect.objectContaining({ test_name: 'packages/core/src/foo.test.ts', pass_count: 1, fail_count: 1 }),
    ]);
    await expect(getGoldenFile('snapshots/foo.json')).resolves.toMatchObject({
      content_hash: 'hash-2',
    });
    await expect(getActivePromptVersion('coding', 'qwen', 'api')).resolves.toMatchObject({
      id: prompt.id,
      success_rate: 0,
      avg_turns: 0,
      avg_cost: 0,
      sample_count: 1,
    });
  });

  it('rejects non-select and multi-statement raw SQL while allowing select reports', async () => {
    initDatabase(createTempDatabaseForTest());
    await createLoop('feature-raw', { primaryModel: 'qwen' });

    await expect(rawQuery('SELECT feature_id FROM loop_history')).resolves.toEqual([
      expect.objectContaining({ feature_id: 'feature-raw' }),
    ]);
    await expect(rawQuery('DELETE FROM loop_history')).rejects.toThrow(/Only SELECT/i);
    await expect(rawQuery('SELECT * FROM loop_history; DROP TABLE loop_history;')).rejects.toThrow(/single SELECT/i);
  });

  it('upserts model profiles and returns the best model without model_pricing table access', async () => {
    initDatabase(createTempDatabaseForTest());

    await updateModelProfile({
      model: 'qwen',
      provider: 'ollama',
      featureType: 'api',
      language: 'typescript',
      hourOfDay: 10,
      successRate: 0.5,
      avgTurnsToSuccess: 3,
      avgTokensPerLoop: 1000,
      avgCostPerLoop: 0,
    });
    await updateModelProfile({
      model: 'qwen',
      provider: 'ollama',
      featureType: 'api',
      language: 'typescript',
      hourOfDay: 10,
      successRate: 0.95,
      avgTurnsToSuccess: 2,
      avgTokensPerLoop: 900,
      avgCostPerLoop: 0,
    });

    await expect(
      getBestModelForFeatureType({
        featureType: 'api',
        language: 'typescript',
        minSamples: 2,
        minSuccessRate: 0.9,
      }),
    ).resolves.toEqual({ model: 'qwen', provider: 'ollama' });
    await expect(rawQuery('SELECT COUNT(*) as count FROM model_profiles')).resolves.toEqual([{ count: 1 }]);
  });
});
