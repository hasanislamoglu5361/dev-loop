import { describe, expect, it, vi } from 'vitest';
import { createSplitPlan } from '../planning/task-splitter.js';

describe('FEATURE083 - Planning Task Splitter', () => {
  it('Test oversized task split', async () => {
    const verifier = {
      generatePlan: vi.fn(async () => [
        { id: 'setup', title: 'Setup', estimatedTurns: 1, acceptanceCriteria: ['ready'] },
        { id: 'big', title: 'Big implementation', estimatedTurns: 5, dependsOn: ['setup'], acceptanceCriteria: ['works'] },
        { id: 'verify', title: 'Verify', estimatedTurns: 1, dependsOn: ['big'], acceptanceCriteria: ['tested'] },
      ]),
      splitTask: vi.fn(async () => [
        { id: 'big-a', title: 'Big implementation A', estimatedTurns: 2, acceptanceCriteria: ['works'] },
        { id: 'big-b', title: 'Big implementation B', estimatedTurns: 2, acceptanceCriteria: ['works'] },
      ]),
    };

    const result = await createSplitPlan({ featureText: 'feature', verifier });

    expect(result.tasks.map(task => task.id)).toEqual(['setup', 'big-a', 'big-b', 'verify']);
    expect(result.tasks.find(task => task.id === 'big-a')?.dependsOn).toEqual(['setup']);
    expect(result.tasks.find(task => task.id === 'big-b')?.dependsOn).toEqual(['big-a']);
    expect(result.tasks.find(task => task.id === 'verify')?.dependsOn).toEqual(['big-b']);
    expect(result.tasks.find(task => task.id === 'big-a')?.acceptanceCriteria).toEqual(['works']);
  });

  it('Test normal task unchanged', async () => {
    const verifier = {
      generatePlan: vi.fn(async () => [
        { id: 'small', title: 'Small implementation', estimatedTurns: 3, acceptanceCriteria: ['done'] },
      ]),
      splitTask: vi.fn(),
    };

    const result = await createSplitPlan({ featureText: 'feature', verifier });

    expect(result.tasks).toEqual([
      expect.objectContaining({ id: 'small', estimatedTurns: 3 }),
    ]);
    expect(verifier.splitTask).not.toHaveBeenCalled();
  });

  it('Test split depth guard', async () => {
    const verifier = {
      generatePlan: vi.fn(async () => [
        { id: 'huge', title: 'Huge implementation', estimatedTurns: 8, acceptanceCriteria: ['done'] },
      ]),
      splitTask: vi.fn(async task => [
        { id: `${task.id}-child`, title: `${task.title} child`, estimatedTurns: 8, acceptanceCriteria: task.acceptanceCriteria },
      ]),
    };

    const result = await createSplitPlan({ featureText: 'feature', verifier, maxDepth: 1 });

    expect(result.tasks).toEqual([
      expect.objectContaining({ id: 'huge-child', estimatedTurns: 8, splitDepth: 1 }),
    ]);
    expect(result.warnings).toEqual([
      'Task "huge-child" still estimates 8 turns after reaching split depth 1.',
    ]);
  });
});
