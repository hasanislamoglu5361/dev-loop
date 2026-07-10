export interface EffortHistoryRecord {
  estimatedEffort: number;
  actualEffort: number;
}

export interface PlanningEstimateTask {
  id: string;
  title: string;
  baseEffort: number;
  priority: number;
  changedFiles?: number;
  uncertainty?: number;
  dependencies?: string[];
}

export interface EstimatePlanningTaskOptions {
  task: PlanningEstimateTask;
  history: EffortHistoryRecord[];
  costPerTurn: number;
}

export interface PlanningTaskEstimate {
  taskId: string;
  effort: number;
  costUsd: number;
  riskScore: number;
  splitSuggested: boolean;
}

export interface SprintTask {
  id: string;
  title: string;
  effort: number;
  priority: number;
}

export interface PlanSprintsOptions {
  tasks: SprintTask[];
  velocity: number;
}

export interface SprintPlan {
  sprint: number;
  capacity: number;
  used: number;
  taskIds: string[];
}

export function estimatePlanningTask(options: EstimatePlanningTaskOptions): PlanningTaskEstimate {
  const bias = effortBias(options.history);
  const effort = round(options.task.baseEffort * bias);
  const riskScore = scoreRisk(options.task);

  return {
    taskId: options.task.id,
    effort,
    costUsd: round(effort * options.costPerTurn),
    riskScore,
    splitSuggested: riskScore >= 70 || effort > 3,
  };
}

export function planSprints(options: PlanSprintsOptions): SprintPlan[] {
  if (options.velocity <= 0) {
    throw new Error('Sprint velocity must be greater than zero.');
  }

  const sortedTasks = options.tasks
    .map(task => ({ ...task }))
    .sort((a, b) => a.priority - b.priority || a.id.localeCompare(b.id));
  const sprints: SprintPlan[] = [];

  for (const task of sortedTasks) {
    let current = sprints.at(-1);
    if (!current || current.used + task.effort > options.velocity) {
      current = {
        sprint: sprints.length + 1,
        capacity: options.velocity,
        used: 0,
        taskIds: [],
      };
      sprints.push(current);
    }

    current.taskIds.push(task.id);
    current.used = round(current.used + task.effort);
  }

  return sprints;
}

function effortBias(history: EffortHistoryRecord[]): number {
  const usable = history.filter(record => record.estimatedEffort > 0 && record.actualEffort > 0);
  if (usable.length < 2) {
    return 1;
  }

  return usable.reduce((sum, record) => sum + (record.actualEffort / record.estimatedEffort), 0) / usable.length;
}

function scoreRisk(task: PlanningEstimateTask): number {
  const changedFiles = task.changedFiles ?? 0;
  const uncertainty = task.uncertainty ?? 0;
  const dependencyCount = task.dependencies?.length ?? 0;
  const score = Math.min(100, Math.round(
    changedFiles * 5 +
    uncertainty * 50 +
    dependencyCount * 10 +
    Math.max(0, task.baseEffort - 3) * 10,
  ));

  return score;
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
