import path from 'node:path';
import { readFileSafe, writeFileAtomic } from '../utils/file-system.js';

export interface LoopMemorySummary {
  loopId: string;
  featureId?: string;
  summary: string;
  files?: string[];
}

export interface SaveLoopSummaryOptions {
  projectDir: string;
  summary: LoopMemorySummary;
}

export interface LoadLoopSummariesOptions {
  projectDir: string;
}

export async function saveLoopSummary(options: SaveLoopSummaryOptions): Promise<void> {
  const summaries = await loadLoopSummaries({ projectDir: options.projectDir });
  const next = [
    ...summaries.filter(summary => summary.loopId !== options.summary.loopId),
    normalizeSummary(options.summary),
  ].sort((a, b) => a.loopId.localeCompare(b.loopId));

  await writeFileAtomic(memoryPath(options.projectDir), `${JSON.stringify(next, null, 2)}\n`);
}

export async function loadLoopSummaries(
  options: LoadLoopSummariesOptions,
): Promise<LoopMemorySummary[]> {
  const content = await readFileSafe(memoryPath(options.projectDir));
  if (!content.trim()) {
    return [];
  }

  const parsed = JSON.parse(content) as LoopMemorySummary[];
  return parsed.map(normalizeSummary).sort((a, b) => a.loopId.localeCompare(b.loopId));
}

function normalizeSummary(summary: LoopMemorySummary): LoopMemorySummary {
  return {
    loopId: summary.loopId,
    featureId: summary.featureId,
    summary: summary.summary,
    files: [...(summary.files ?? [])].sort(),
  };
}

function memoryPath(projectDir: string): string {
  return path.join(projectDir, '.dev-loop', 'memory.json');
}
