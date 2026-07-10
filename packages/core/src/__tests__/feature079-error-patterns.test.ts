import { describe, expect, it } from 'vitest';
import {
  buildEvolvedSystemPrompt,
  learnErrorPattern,
} from '../context/error-patterns.js';
import type { LearnedErrorPattern } from '../context/error-patterns.js';

describe('FEATURE079 - Error Pattern Learning', () => {
  it('Test first bug creates pattern', () => {
    const patterns: LearnedErrorPattern[] = [];

    const result = learnErrorPattern(patterns, {
      bug: {
        model: 'qwen',
        featureKeywords: ['runtime', 'mcp'],
        errorDescription: 'Forgot to stop child processes',
        fixDescription: 'Track children and stop all with SIGTERM',
      },
      now: '2026-07-10T08:00:00.000Z',
    });

    expect(result.pattern).toMatchObject({
      model: 'qwen',
      featureKeywords: ['runtime', 'mcp'],
      errorDescription: 'Forgot to stop child processes',
      fixDescription: 'Track children and stop all with SIGTERM',
      seenCount: 1,
      firstSeen: '2026-07-10T08:00:00.000Z',
      lastSeen: '2026-07-10T08:00:00.000Z',
      active: true,
    });
    expect(result.pattern.patternHash).toMatch(/^qwen:/);
  });

  it('Test repeat increments', () => {
    const first = learnErrorPattern([], {
      bug: {
        model: 'qwen',
        featureKeywords: ['runtime'],
        errorDescription: 'Forgot to stop child processes',
        fixDescription: 'Track children and stop all with SIGTERM',
      },
      now: '2026-07-10T08:00:00.000Z',
    });

    const second = learnErrorPattern(first.patterns, {
      bug: {
        model: 'qwen',
        featureKeywords: ['runtime'],
        errorDescription: 'Forgot to stop child processes',
        fixDescription: 'Track children and stop all with SIGTERM',
      },
      now: '2026-07-10T08:05:00.000Z',
    });

    expect(second.pattern.seenCount).toBe(2);
    expect(second.pattern.firstSeen).toBe('2026-07-10T08:00:00.000Z');
    expect(second.pattern.lastSeen).toBe('2026-07-10T08:05:00.000Z');
  });

  it('Test changed fix appends version history', () => {
    const first = learnErrorPattern([], {
      bug: {
        model: 'qwen',
        versionContext: 'v1',
        errorDescription: 'Bad SQL update',
        fixDescription: 'Use parameterized SQL',
      },
      now: '2026-07-10T08:00:00.000Z',
    });

    const second = learnErrorPattern(first.patterns, {
      bug: {
        model: 'qwen',
        versionContext: 'v2',
        errorDescription: 'Bad SQL update',
        fixDescription: 'Use allow-listed update columns',
      },
      now: '2026-07-10T08:10:00.000Z',
    });

    expect(second.pattern.fixDescription).toBe('Use allow-listed update columns');
    expect(second.pattern.versionHistory).toEqual([
      { versionContext: 'v1', fixDescription: 'Use parameterized SQL' },
      { versionContext: 'v2', fixDescription: 'Use allow-listed update columns' },
    ]);
    expect(second.conflict).toBe(true);
  });

  it('Test retired pattern excluded', () => {
    const prompt = buildEvolvedSystemPrompt({
      basePrompt: 'Base system prompt.',
      patterns: [
        {
          patternHash: 'active',
          model: 'qwen',
          featureKeywords: ['api'],
          errorDescription: 'Leaked sk-secret-value in prompt',
          fixDescription: 'Redact secrets before prompt injection',
          seenCount: 5,
          firstSeen: '2026-07-10T08:00:00.000Z',
          lastSeen: '2026-07-10T08:05:00.000Z',
          versionHistory: [],
          active: true,
        },
        {
          patternHash: 'retired',
          model: 'qwen',
          featureKeywords: ['old'],
          errorDescription: 'Old retired issue',
          fixDescription: 'Do not include',
          seenCount: 99,
          firstSeen: '2026-07-10T08:00:00.000Z',
          lastSeen: '2026-07-10T08:05:00.000Z',
          versionHistory: [],
          active: false,
        },
      ],
      limit: 3,
    });

    expect(prompt).toContain('Base system prompt.');
    expect(prompt).toContain('Known error patterns');
    expect(prompt).toContain('[REDACTED]');
    expect(prompt).not.toContain('sk-secret-value');
    expect(prompt).not.toContain('Old retired issue');
  });
});
