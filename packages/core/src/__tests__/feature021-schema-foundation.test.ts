import { describe, expect, it } from 'vitest';
import { getTableColumns, getTableName } from 'drizzle-orm';
import { getTableConfig } from 'drizzle-orm/sqlite-core';
import {
  errorPatterns,
  loopHistory,
  loopTurns,
  modelProfiles,
  successPatterns,
} from '../db/schema.js';
import type {
  ErrorPattern,
  LoopHistory,
  LoopTurn,
  ModelProfile,
  NewErrorPattern,
  NewLoopHistory,
  NewLoopTurn,
  NewModelProfile,
  NewSuccessPattern,
  SuccessPattern,
} from '../db/schema.js';

function indexNames(table: Parameters<typeof getTableConfig>[0]): string[] {
  return getTableConfig(table).indexes.map(index => index.config.name).sort();
}

function expectType<T>(value: T): T {
  return value;
}

describe('FEATURE021 - Drizzle SQLite Schema Foundation', () => {
  it('exports the first group with real SQLite table names and columns', () => {
    expect(getTableName(loopHistory)).toBe('loop_history');
    expect(getTableName(loopTurns)).toBe('loop_turns');
    expect(getTableName(errorPatterns)).toBe('error_patterns');
    expect(getTableName(successPatterns)).toBe('success_patterns');
    expect(getTableName(modelProfiles)).toBe('model_profiles');

    expect(getTableColumns(loopHistory).featureId.name).toBe('feature_id');
    expect(getTableColumns(loopHistory).totalCostUsd.name).toBe('total_cost_usd');
    expect(getTableColumns(loopTurns).loopId.name).toBe('loop_id');
    expect(getTableColumns(errorPatterns).patternHash.name).toBe('pattern_hash');
    expect(getTableColumns(successPatterns).turnsToComplete.name).toBe('turns_to_complete');
    expect(getTableColumns(modelProfiles).avgTokensPerSecond.name).toBe('avg_tokens_per_second');
  });

  it('defines Drizzle indexes for the first schema group', () => {
    expect(indexNames(loopHistory)).toEqual(expect.arrayContaining([
      'idx_loop_history_created',
      'idx_loop_history_model',
      'idx_loop_history_success',
    ]));
    expect(indexNames(errorPatterns)).toEqual(expect.arrayContaining([
      'idx_error_patterns_hash',
      'idx_error_patterns_model',
    ]));
    expect(indexNames(modelProfiles)).toContain('idx_model_profiles_lookup');
  });

  it('exports inferred select and insert types for the first schema group', () => {
    const newLoop = expectType<NewLoopHistory>({ featureId: 'feature-1' });
    const loop = expectType<LoopHistory>({
      id: 1,
      featureId: 'feature-1',
      featureSummary: null,
      featureKeywords: null,
      featureType: null,
      language: null,
      primaryModel: null,
      primaryProvider: null,
      verifierModel: null,
      verifierProvider: null,
      fallbackUsed: 0,
      fallbackModel: null,
      totalTurns: 0,
      success: 0,
      failureReason: null,
      durationSeconds: null,
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalCostUsd: 0,
      commitHash: null,
      branchName: null,
      prUrl: null,
      qualityGatePassed: 0,
      testCoveragePct: null,
      uncertainTagsFound: 0,
      uncertainTagsResolved: 0,
      userRating: null,
      planningLoopId: null,
      createdAt: '2026-07-10 00:00:00',
      completedAt: null,
    });

    const newTurn = expectType<NewLoopTurn>({ loopId: 1, turnNumber: 1, agent: 'primary' });
    const turn = expectType<LoopTurn>({
      id: 1,
      loopId: 1,
      turnNumber: 1,
      agent: 'primary',
      model: null,
      inputTokens: null,
      outputTokens: null,
      costUsd: null,
      durationSeconds: null,
      success: 0,
      errorMessage: null,
      errorType: null,
      diffSizeLines: null,
      filesChanged: null,
      uncertainTagsAdded: 0,
      mcpServersUsed: null,
      createdAt: '2026-07-10 00:00:00',
    });

    const newError = expectType<NewErrorPattern>({
      patternHash: 'hash',
      model: 'model',
      featureKeywords: '["db"]',
      errorDescription: 'error',
      fixDescription: 'fix',
    });
    const error = expectType<ErrorPattern>({
      ...newError,
      id: 1,
      provider: null,
      language: null,
      errorCategory: null,
      fixExample: null,
      versionContext: null,
      versionHistory: null,
      seenCount: 1,
      firstSeen: '2026-07-10 00:00:00',
      lastSeen: '2026-07-10 00:00:00',
      lastUpdated: null,
      autoInject: 1,
      conflictingPatternId: null,
    });

    const newSuccess = expectType<NewSuccessPattern>({
      model: 'model',
      featureKeywords: '["db"]',
    });
    const success = expectType<SuccessPattern>({
      ...newSuccess,
      id: 1,
      provider: null,
      language: null,
      featureType: null,
      successDescription: null,
      turnsToComplete: null,
      promptVersion: null,
      mcpUsed: null,
      seenCount: 1,
      firstSeen: '2026-07-10 00:00:00',
      lastSeen: '2026-07-10 00:00:00',
    });

    const newProfile = expectType<NewModelProfile>({
      model: 'model',
      provider: 'provider',
    });
    const profile = expectType<ModelProfile>({
      ...newProfile,
      id: 1,
      featureType: null,
      language: null,
      hourOfDay: null,
      dayOfWeek: null,
      avgTurnsToSuccess: null,
      successRate: null,
      avgTokensPerLoop: null,
      avgCostPerLoop: null,
      avgTokensPerSecond: null,
      totalLoops: 0,
      lastUpdated: '2026-07-10 00:00:00',
    });

    expect(newLoop.featureId).toBe(loop.featureId);
    expect(newTurn.loopId).toBe(turn.loopId);
    expect(newError.patternHash).toBe(error.patternHash);
    expect(newSuccess.model).toBe(success.model);
    expect(newProfile.model).toBe(profile.model);
  });
});
