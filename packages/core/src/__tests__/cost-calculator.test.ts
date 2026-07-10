import { describe, expect, it } from 'vitest';
import * as core from '../index.js';
import {
  CostTracker,
  calculateCallCost,
  estimateCost,
  estimateLoopCost,
} from '../utils/cost-calculator.js';

describe('FEATURE032 - cost calculator and tracker', () => {
  it('calculates known, unknown, and local model costs using per-1K pricing', () => {
    expect(calculateCallCost(1000, 1000, 'openrouter', 'openai/gpt-4o')).toMatchObject({
      inputCostUsd: 0.0025,
      outputCostUsd: 0.01,
      totalCostUsd: 0.0125,
      provider: 'openrouter',
      model: 'openai/gpt-4o',
    });
    expect(calculateCallCost(1000, 1000, 'unknown', 'unknown')).toMatchObject({
      inputCostUsd: 0,
      outputCostUsd: 0,
      totalCostUsd: 0,
    });
    expect(calculateCallCost(50000, 50000, 'ollama', 'qwen2.5-coder')).toMatchObject({
      inputCostUsd: 0,
      outputCostUsd: 0,
      totalCostUsd: 0,
    });
  });

  it('tracks accumulated totals, budget exceeded, remaining budget, and injectable logging', () => {
    const logged: unknown[] = [];
    const tracker = new CostTracker({
      onCost: breakdown => logged.push(breakdown),
    });

    tracker.add(1000, 1000, 'openrouter', 'openai/gpt-4o');
    tracker.add(1, 1, 'openrouter', 'openai/gpt-4o');

    expect(tracker.total).toBe(0.0125125);
    expect(tracker.lastCost).toMatchObject({ inputTokens: 1, outputTokens: 1 });
    expect(tracker.allBreakdowns).toHaveLength(2);
    expect(logged).toHaveLength(2);
    expect(tracker.isExceeded(0.012)).toBe(true);
    expect(tracker.remainingBudget(0.02)).toBe(0.0074875);

    tracker.reset();
    expect(tracker.total).toBe(0);
    expect(tracker.allBreakdowns).toEqual([]);
  });

  it('estimates single calls and loop totals without mutating pricing tables', () => {
    expect(estimateCost(1000, 0, 'openrouter', 'deepseek/deepseek-r1')).toMatchObject({
      totalCostUsd: 0.0009,
    });

    const estimates = estimateLoopCost({
      turnCount: 2,
      avgInputTokensPerTurn: 1000,
      avgOutputTokensPerTurn: 1000,
      provider: 'openrouter',
      modelId: 'qwen/qwen-2.5-coder-32b',
    });

    expect(estimates).toHaveLength(2);
    expect(estimates.reduce((sum, cost) => sum + cost.totalCostUsd, 0)).toBe(0.0056);
  });

  it('exports cost utilities from the core public entrypoint', () => {
    expect(core).toEqual(expect.objectContaining({
      CostTracker: expect.any(Function),
      calculateCallCost: expect.any(Function),
      estimateCost: expect.any(Function),
      estimateLoopCost: expect.any(Function),
    }));
  });
});
