import { describe, expect, it } from 'vitest';
import {
  buildCalibrationSummary,
  recordSuccessPattern,
  updateModelProfile,
} from '../context/calibration.js';
import type { ModelCalibrationProfile, SuccessPatternRecord } from '../context/calibration.js';

describe('FEATURE080 - Success Patterns and Calibration', () => {
  it('Test success pattern creation', () => {
    const patterns: SuccessPatternRecord[] = [];

    const result = recordSuccessPattern(patterns, {
      loopId: 'loop-1',
      success: true,
      model: 'qwen',
      provider: 'ollama',
      featureType: 'runtime',
      language: 'typescript',
      turns: 2,
      mcpToolsUsed: ['filesystem.read', 'git.diff'],
      completedAt: '2026-07-10T08:00:00.000Z',
    });

    expect(result).toEqual([
      expect.objectContaining({
        loopId: 'loop-1',
        model: 'qwen',
        provider: 'ollama',
        featureType: 'runtime',
        language: 'typescript',
        turnsToComplete: 2,
        mcpToolsUsed: ['filesystem.read', 'git.diff'],
      }),
    ]);
    expect(recordSuccessPattern(result, {
      loopId: 'loop-failed',
      success: false,
      model: 'qwen',
      featureType: 'runtime',
      language: 'typescript',
      turns: 4,
      mcpToolsUsed: ['bad.tool'],
      completedAt: '2026-07-10T09:00:00.000Z',
    })).toHaveLength(1);
  });

  it('Test model profile insert/update', () => {
    let profiles: ModelCalibrationProfile[] = [];

    profiles = updateModelProfile(profiles, {
      loopId: 'loop-1',
      success: true,
      model: 'qwen',
      featureType: 'runtime',
      language: 'typescript',
      turns: 2,
      costUsd: 0.2,
      durationMs: 1000,
      completedAt: '2026-07-10T08:30:00.000Z',
    });
    profiles = updateModelProfile(profiles, {
      loopId: 'loop-2',
      success: false,
      model: 'qwen',
      featureType: 'runtime',
      language: 'typescript',
      turns: 4,
      costUsd: 0.6,
      durationMs: 3000,
      completedAt: '2026-07-10T08:45:00.000Z',
    });

    expect(profiles).toEqual([
      expect.objectContaining({
        model: 'qwen',
        featureType: 'runtime',
        language: 'typescript',
        hour: 8,
        dayOfWeek: 'Friday',
        totalRuns: 2,
        successfulRuns: 1,
        successRate: 0.5,
        averageTurns: 3,
      }),
    ]);
  });

  it('Test averages', () => {
    const profiles: ModelCalibrationProfile[] = [
      {
        key: 'qwen|runtime|typescript|8|Friday',
        model: 'qwen',
        featureType: 'runtime',
        language: 'typescript',
        hour: 8,
        dayOfWeek: 'Friday',
        totalRuns: 4,
        successfulRuns: 3,
        successRate: 0.75,
        averageTurns: 2.5,
        averageCostUsd: 0.3,
        averageDurationMs: 1500,
      },
    ];

    expect(buildCalibrationSummary(profiles)).toEqual([
      'qwen runtime/typescript Friday 08:00 success 75% avg turns 2.5 avg cost $0.3000',
    ]);
  });
});
