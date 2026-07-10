import { afterEach, describe, expect, it } from 'vitest';
import crypto from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { closeDatabase, initDatabase } from '../db/connection.js';
import {
  copyErrorPatterns,
  createErrorPattern,
  createSuccessPattern,
  getDistinctModels,
  getErrorPatternByHash,
  getErrorPatterns,
  getSuccessPatterns,
  retireErrorPattern,
  updateErrorPattern,
} from '../db/queries.js';

function createTempDatabaseForTest(): string {
  return path.join(os.tmpdir(), `dev-loop-feature028-${crypto.randomUUID()}.db`);
}

afterEach(() => {
  closeDatabase();
});

describe('FEATURE028 - error and success pattern queries', () => {
  it('creates, looks up, updates, and retires error patterns safely', async () => {
    initDatabase(createTempDatabaseForTest());

    const created = await createErrorPattern({
      patternHash: 'hash-api-1',
      model: 'qwen',
      provider: 'ollama',
      featureKeywords: ['api', 'sqlite'],
      language: 'typescript',
      errorDescription: 'Bad SQL update',
      errorCategory: 'database',
      fixDescription: 'Use allow-listed columns',
      fixExample: 'buildUpdate(updates, columns)',
      versionContext: '0.1.0',
      versionHistory: ['0.1.0'],
      seenCount: 0,
      autoInject: true,
    });

    await expect(getErrorPatternByHash('hash-api-1')).resolves.toMatchObject({
      id: created.id,
      pattern_hash: 'hash-api-1',
      feature_keywords: '["api","sqlite"]',
      version_history: '["0.1.0"]',
      seen_count: 0,
      auto_inject: 1,
    });

    await updateErrorPattern(created.id, {
      featureKeywords: ['api', 'safe-sql'],
      versionHistory: ['0.1.0', '0.1.1'],
      seenCount: 1,
      autoInject: false,
    });

    await expect(getErrorPatternByHash('hash-api-1')).resolves.toMatchObject({
      feature_keywords: '["api","safe-sql"]',
      version_history: '["0.1.0","0.1.1"]',
      seen_count: 1,
      auto_inject: 0,
    });

    await updateErrorPattern(created.id, { autoInject: true });
    await expect(getErrorPatterns({ autoInject: true })).resolves.toHaveLength(1);

    await retireErrorPattern(created.id);
    await expect(getErrorPatterns()).resolves.toEqual([]);
    await expect(getErrorPatterns({ autoInject: false })).resolves.toEqual([
      expect.objectContaining({ id: created.id, auto_inject: 0 }),
    ]);
  });

  it('rejects unsafe error pattern orderBy fields', async () => {
    initDatabase(createTempDatabaseForTest());

    await expect(
      getErrorPatterns({ orderBy: 'seen_count DESC; DROP TABLE error_patterns; --' }),
    ).rejects.toThrow(/Invalid orderBy/);
  });

  it('creates and reads success patterns and distinct models without double-stringifying arrays', async () => {
    initDatabase(createTempDatabaseForTest());

    await createErrorPattern({
      patternHash: 'hash-qwen',
      model: 'qwen',
      featureKeywords: ['api'],
      errorDescription: 'qwen error',
      fixDescription: 'qwen fix',
    });
    await createSuccessPattern({
      model: 'claude',
      provider: 'anthropic',
      featureKeywords: ['ui', 'react'],
      language: 'typescript',
      featureType: 'ui',
      successDescription: 'Component refactor worked',
      turnsToComplete: 0,
      promptVersion: 'v1',
      mcpUsed: ['filesystem', 'git'],
    });

    await expect(getSuccessPatterns({ model: 'claude' })).resolves.toEqual([
      expect.objectContaining({
        model: 'claude',
        feature_keywords: '["ui","react"]',
        turns_to_complete: 0,
        mcp_used: '["filesystem","git"]',
      }),
    ]);
    await expect(getDistinctModels()).resolves.toEqual(['claude', 'qwen']);
  });

  it('copies only active error patterns to another model', async () => {
    initDatabase(createTempDatabaseForTest());

    await createErrorPattern({
      patternHash: 'copy-active',
      model: 'qwen',
      provider: 'ollama',
      featureKeywords: ['api'],
      errorDescription: 'copy me',
      fixDescription: 'copied fix',
      autoInject: true,
    });
    const retired = await createErrorPattern({
      patternHash: 'copy-retired',
      model: 'qwen',
      provider: 'ollama',
      featureKeywords: ['api'],
      errorDescription: 'do not copy',
      fixDescription: 'retired fix',
      autoInject: true,
    });
    await retireErrorPattern(retired.id);

    const result = await copyErrorPatterns({
      fromModel: 'qwen',
      toModel: 'deepseek',
      toProvider: 'ollama',
    });

    expect(result).toEqual({ copied: 1 });
    await expect(getErrorPatterns({ model: 'deepseek' })).resolves.toEqual([
      expect.objectContaining({
        pattern_hash: 'copy-active:deepseek',
        model: 'deepseek',
        provider: 'ollama',
        feature_keywords: '["api"]',
        auto_inject: 1,
      }),
    ]);
  });
});
