import { describe, expect, it } from 'vitest';
import {
  PlanningDependencyError,
  resolvePlanningDependencies,
} from '../planning/dependency.js';

describe('FEATURE082 - Planning Dependency Graph', () => {
  it('Test valid ordering', () => {
    const ordered = resolvePlanningDependencies([
      { id: 'test', title: 'Run tests', dependsOn: ['implement'] },
      { id: 'design', title: 'Design API' },
      { id: 'implement', title: 'Implement API', dependsOn: ['design'] },
    ]);

    expect(ordered.map(task => task.id)).toEqual(['design', 'implement', 'test']);
  });

  it('Test circular dependency', () => {
    expect(() => resolvePlanningDependencies([
      { id: 'a', title: 'A', dependsOn: ['b'] },
      { id: 'b', title: 'B', dependsOn: ['c'] },
      { id: 'c', title: 'C', dependsOn: ['a'] },
    ])).toThrow(new PlanningDependencyError('Circular planning dependency detected: a -> b -> c -> a'));
  });

  it('Test missing dependency', () => {
    expect(() => resolvePlanningDependencies([
      { id: 'deploy', title: 'Deploy', dependsOn: ['build'] },
    ])).toThrow(new PlanningDependencyError('Planning task "deploy" depends on missing task "build".'));
  });
});
