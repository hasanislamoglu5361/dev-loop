export interface LoopPerformanceRecord {
  loopId: string;
  success: boolean;
  model: string;
  provider?: string;
  featureType: string;
  language: string;
  turns: number;
  costUsd?: number;
  durationMs?: number;
  mcpToolsUsed?: string[];
  completedAt: string;
}

export interface SuccessPatternRecord {
  loopId: string;
  model: string;
  provider?: string;
  featureType: string;
  language: string;
  turnsToComplete: number;
  mcpToolsUsed: string[];
  completedAt: string;
}

export interface ModelCalibrationProfile {
  key: string;
  model: string;
  featureType: string;
  language: string;
  hour: number;
  dayOfWeek: string;
  totalRuns: number;
  successfulRuns: number;
  successRate: number;
  averageTurns: number;
  averageCostUsd: number;
  averageDurationMs: number;
}

export function recordSuccessPattern(
  patterns: SuccessPatternRecord[],
  loop: LoopPerformanceRecord,
): SuccessPatternRecord[] {
  if (!loop.success) {
    return patterns.slice();
  }

  const next: SuccessPatternRecord = {
    loopId: loop.loopId,
    model: loop.model,
    provider: loop.provider,
    featureType: loop.featureType,
    language: loop.language,
    turnsToComplete: loop.turns,
    mcpToolsUsed: [...(loop.mcpToolsUsed ?? [])].sort(),
    completedAt: loop.completedAt,
  };

  return [
    ...patterns.filter(pattern => pattern.loopId !== loop.loopId),
    next,
  ].sort((a, b) => a.loopId.localeCompare(b.loopId));
}

export function updateModelProfile(
  profiles: ModelCalibrationProfile[],
  loop: LoopPerformanceRecord,
): ModelCalibrationProfile[] {
  const date = new Date(loop.completedAt);
  const hour = date.getUTCHours();
  const dayOfWeek = dayName(date.getUTCDay());
  const key = profileKey(loop.model, loop.featureType, loop.language, hour, dayOfWeek);
  const existing = profiles.find(profile => profile.key === key);
  const totalRuns = (existing?.totalRuns ?? 0) + 1;
  const successfulRuns = (existing?.successfulRuns ?? 0) + (loop.success ? 1 : 0);

  const updated: ModelCalibrationProfile = {
    key,
    model: loop.model,
    featureType: loop.featureType,
    language: loop.language,
    hour,
    dayOfWeek,
    totalRuns,
    successfulRuns,
    successRate: round(successfulRuns / totalRuns),
    averageTurns: rollingAverage(existing?.averageTurns ?? 0, existing?.totalRuns ?? 0, loop.turns),
    averageCostUsd: rollingAverage(existing?.averageCostUsd ?? 0, existing?.totalRuns ?? 0, loop.costUsd ?? 0),
    averageDurationMs: rollingAverage(existing?.averageDurationMs ?? 0, existing?.totalRuns ?? 0, loop.durationMs ?? 0),
  };

  return [
    ...profiles.filter(profile => profile.key !== key),
    updated,
  ].sort((a, b) => a.key.localeCompare(b.key));
}

export function buildCalibrationSummary(
  profiles: ModelCalibrationProfile[],
  limit = 5,
): string[] {
  return profiles
    .slice()
    .sort((a, b) => b.successRate - a.successRate || b.totalRuns - a.totalRuns || a.key.localeCompare(b.key))
    .slice(0, limit)
    .map(profile => `${profile.model} ${profile.featureType}/${profile.language} ${profile.dayOfWeek} ${String(profile.hour).padStart(2, '0')}:00 success ${Math.round(profile.successRate * 100)}% avg turns ${profile.averageTurns} avg cost $${profile.averageCostUsd.toFixed(4)}`);
}

function rollingAverage(previousAverage: number, previousCount: number, nextValue: number): number {
  return round(((previousAverage * previousCount) + nextValue) / (previousCount + 1));
}

function round(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

function profileKey(
  model: string,
  featureType: string,
  language: string,
  hour: number,
  dayOfWeek: string,
): string {
  return `${model}|${featureType}|${language}|${hour}|${dayOfWeek}`;
}

function dayName(day: number): string {
  return ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][day] ?? 'Unknown';
}
