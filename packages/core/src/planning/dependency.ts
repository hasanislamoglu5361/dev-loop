export interface PlanTask {
  id: string;
  title: string;
  dependsOn?: string[];
}

export class PlanningDependencyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PlanningDependencyError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export function resolvePlanningDependencies<T extends PlanTask>(tasks: T[]): T[] {
  const byId = new Map<string, T>();

  for (const task of tasks) {
    if (byId.has(task.id)) {
      throw new PlanningDependencyError(`Duplicate planning task id: ${task.id}`);
    }
    byId.set(task.id, task);
  }

  for (const task of tasks) {
    for (const dependencyId of task.dependsOn ?? []) {
      if (!byId.has(dependencyId)) {
        throw new PlanningDependencyError(`Planning task "${task.id}" depends on missing task "${dependencyId}".`);
      }
    }
  }

  const ordered: T[] = [];
  const permanent = new Set<string>();
  const temporary = new Set<string>();
  const sortedTasks = tasks.slice().sort((a, b) => a.id.localeCompare(b.id));

  for (const task of sortedTasks) {
    visit(task, byId, permanent, temporary, [], ordered);
  }

  return ordered;
}

function visit<T extends PlanTask>(
  task: T,
  byId: Map<string, T>,
  permanent: Set<string>,
  temporary: Set<string>,
  stack: string[],
  ordered: T[],
): void {
  if (permanent.has(task.id)) {
    return;
  }

  if (temporary.has(task.id)) {
    const start = stack.indexOf(task.id);
    const cycle = [...stack.slice(start), task.id].join(' -> ');
    throw new PlanningDependencyError(`Circular planning dependency detected: ${cycle}`);
  }

  temporary.add(task.id);
  stack.push(task.id);

  for (const dependencyId of [...(task.dependsOn ?? [])].sort()) {
    visit(byId.get(dependencyId) as T, byId, permanent, temporary, stack, ordered);
  }

  stack.pop();
  temporary.delete(task.id);
  permanent.add(task.id);
  ordered.push(task);
}
