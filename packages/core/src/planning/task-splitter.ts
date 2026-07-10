export interface SplitPlanTask {
  id: string;
  title: string;
  estimatedTurns: number;
  dependsOn?: string[];
  acceptanceCriteria: string[];
  splitDepth?: number;
}

export interface PlanningTaskVerifier {
  generatePlan(featureText: string): Promise<SplitPlanTask[]>;
  splitTask(task: SplitPlanTask): Promise<SplitPlanTask[]>;
}

export interface CreateSplitPlanOptions {
  featureText: string;
  verifier: PlanningTaskVerifier;
  maxTurns?: number;
  maxDepth?: number;
}

export interface CreateSplitPlanResult {
  tasks: SplitPlanTask[];
  warnings: string[];
}

export async function createSplitPlan(options: CreateSplitPlanOptions): Promise<CreateSplitPlanResult> {
  const maxTurns = options.maxTurns ?? 3;
  const maxDepth = options.maxDepth ?? 2;
  const rawTasks = await options.verifier.generatePlan(options.featureText);
  const warnings: string[] = [];
  const splitByOriginal = new Map<string, SplitPlanTask[]>();

  for (const task of rawTasks) {
    splitByOriginal.set(task.id, await splitTaskRecursive(task, options.verifier, maxTurns, maxDepth, warnings, 0));
  }

  const tasks: SplitPlanTask[] = [];
  for (const task of rawTasks) {
    const splitTasks = splitByOriginal.get(task.id) ?? [task];
    tasks.push(...wireSplitDependencies(task, splitTasks, splitByOriginal));
  }

  return { tasks, warnings };
}

async function splitTaskRecursive(
  task: SplitPlanTask,
  verifier: PlanningTaskVerifier,
  maxTurns: number,
  maxDepth: number,
  warnings: string[],
  depth: number,
): Promise<SplitPlanTask[]> {
  if (task.estimatedTurns <= maxTurns) {
    return [{ ...task, splitDepth: depth || task.splitDepth }];
  }

  if (depth >= maxDepth) {
    warnings.push(`Task "${task.id}" still estimates ${task.estimatedTurns} turns after reaching split depth ${maxDepth}.`);
    return [{ ...task, splitDepth: depth }];
  }

  const children = await verifier.splitTask(task);
  const results: SplitPlanTask[] = [];

  for (const child of children) {
    results.push(...await splitTaskRecursive({
      ...child,
      acceptanceCriteria: child.acceptanceCriteria?.length ? child.acceptanceCriteria : task.acceptanceCriteria,
      splitDepth: depth + 1,
    }, verifier, maxTurns, maxDepth, warnings, depth + 1));
  }

  return results;
}

function wireSplitDependencies(
  original: SplitPlanTask,
  splitTasks: SplitPlanTask[],
  splitByOriginal: Map<string, SplitPlanTask[]>,
): SplitPlanTask[] {
  return splitTasks.map((task, index) => {
    if (index > 0) {
      return {
        ...task,
        dependsOn: [splitTasks[index - 1].id],
      };
    }

    return {
      ...task,
      dependsOn: (original.dependsOn ?? []).map(dependencyId => {
        const dependencySplit = splitByOriginal.get(dependencyId);
        return dependencySplit?.at(-1)?.id ?? dependencyId;
      }),
    };
  });
}
