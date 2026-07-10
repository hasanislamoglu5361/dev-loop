import { describe, expect, it } from 'vitest';
import {
  estimatePlanningTask,
  planSprints,
} from '../planning/effort.js';

describe('FEATURE084 - Effort, Risk, and Sprint Planning', () => {
  it('Test insufficient history fallback', () => {
    const estimate = estimatePlanningTask({
      task: { id: 'a', title: 'Small task', baseEffort: 3, priority: 1 },
      history: [],
      costPerTurn: 0.25,
    });

    expect(estimate).toMatchObject({
      taskId: 'a',
      effort: 3,
      costUsd: 0.75,
      riskScore: expect.any(Number),
      splitSuggested: false,
    });
  });

  it('Test bias correction', () => {
    const estimate = estimatePlanningTask({
      task: { id: 'a', title: 'API task', baseEffort: 3, priority: 1, changedFiles: 8, uncertainty: 0.8 },
      history: [
        { estimatedEffort: 2, actualEffort: 4 },
        { estimatedEffort: 3, actualEffort: 6 },
      ],
      costPerTurn: 0.1,
    });

    expect(estimate.effort).toBe(6);
    expect(estimate.costUsd).toBe(0.6);
    expect(estimate.riskScore).toBeGreaterThanOrEqual(70);
    expect(estimate.splitSuggested).toBe(true);
  });

  it('Test sprint capacity', () => {
    const tasks = [
      { id: 'low', title: 'Low', effort: 2, priority: 3 },
      { id: 'high', title: 'High', effort: 3, priority: 1 },
      { id: 'mid', title: 'Mid', effort: 2, priority: 2 },
    ];
    const original = tasks.map(task => ({ ...task }));

    const sprints = planSprints({ tasks, velocity: 4 });

    expect(sprints).toEqual([
      { sprint: 1, capacity: 4, used: 3, taskIds: ['high'] },
      { sprint: 2, capacity: 4, used: 4, taskIds: ['mid', 'low'] },
    ]);
    expect(tasks).toEqual(original);
  });
});
