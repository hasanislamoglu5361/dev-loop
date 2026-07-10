export interface BenchmarkChartDatum { id: string; label: string; value: number; normalized: number }

export function buildBenchmarkChartData(results: Array<{ id: string; name?: string; tokensPerSecond?: number }>): BenchmarkChartDatum[] {
  const safe = results.map(result => ({ id: result.id, label: result.name ?? result.id, value: finiteNonNegative(result.tokensPerSecond) }));
  const maximum = Math.max(0, ...safe.map(item => item.value));
  return safe.map(item => ({ ...item, normalized: maximum === 0 ? 0 : item.value / maximum }));
}

function finiteNonNegative(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0;
}
