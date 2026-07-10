export interface BenchmarkModel {
  id: string;
  provider: string;
  local?: boolean;
  requiredVramMb?: number;
}

export interface BenchmarkLoopResult {
  success: boolean;
  turns: number;
  costUsd?: number;
}

export type BenchmarkStatus = 'passed' | 'failed' | 'skipped';

export interface BenchmarkResult {
  modelId: string;
  status: BenchmarkStatus;
  success: boolean;
  turns: number;
  costUsd: number;
  durationMs: number;
  reason?: string;
}

export interface BenchmarkVramManager {
  canLoad(model: BenchmarkModel): Promise<boolean>;
  load(model: BenchmarkModel): Promise<void>;
  unload(model: BenchmarkModel): Promise<void>;
}

export interface RunBenchmarksOptions {
  models: BenchmarkModel[];
  runLoop(model: BenchmarkModel): Promise<BenchmarkLoopResult>;
  isolateRun(model: BenchmarkModel): Promise<void>;
  saveResults(results: BenchmarkResult[]): Promise<void> | void;
  vram?: BenchmarkVramManager;
  now?: () => number;
}

export interface RunBenchmarksResult {
  results: BenchmarkResult[];
}

export async function runBenchmarks(options: RunBenchmarksOptions): Promise<RunBenchmarksResult> {
  const now = options.now ?? Date.now;
  const results: BenchmarkResult[] = [];

  for (const model of options.models) {
    if (model.local && options.vram && !await options.vram.canLoad(model)) {
      results.push({
        modelId: model.id,
        status: 'skipped',
        success: false,
        turns: 0,
        costUsd: 0,
        durationMs: 1,
        reason: 'Insufficient VRAM.',
      });
      continue;
    }

    await options.isolateRun(model);
    let loaded = false;
    const startedAt = now();

    try {
      if (model.local && options.vram) {
        await options.vram.load(model);
        loaded = true;
      }

      const loopResult = await options.runLoop(model);
      results.push({
        modelId: model.id,
        status: loopResult.success ? 'passed' : 'failed',
        success: loopResult.success,
        turns: loopResult.turns,
        costUsd: loopResult.costUsd ?? 0,
        durationMs: safeDuration(now() - startedAt),
      });
    } catch (error) {
      results.push({
        modelId: model.id,
        status: 'failed',
        success: false,
        turns: 0,
        costUsd: 0,
        durationMs: safeDuration(now() - startedAt),
        reason: error instanceof Error ? error.message : String(error),
      });
    } finally {
      if (loaded && model.local && options.vram) {
        await options.vram.unload(model);
      }
    }
  }

  await options.saveResults(results);

  return { results };
}

function safeDuration(durationMs: number): number {
  return Math.max(1, durationMs);
}
