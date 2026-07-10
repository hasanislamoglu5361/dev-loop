// packages/core/src/analytics/anomaly.ts
// Anomaly detection utilities for analytics data.

export interface CostSpikeResult {
  detected: boolean;
  index?: number;
  value?: number;
}

/**
 * Detect cost spike anomalies using standard deviation threshold.
 * A value that exceeds `stdThreshold` standard deviations from the mean is flagged as an anomaly.
 *
 * @param costs - Array of cost values to analyze
 * @param stdThreshold - Number of standard deviations above which a value is considered anomalous (default: 2)
 */
export function detectCostSpike(costs: number[], stdThreshold: number = 2): CostSpikeResult {
  if (costs.length < 3) return { detected: false };

  const mean = costs.reduce((a, b) => a + b, 0) / costs.length;
  const variance = costs.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / costs.length;
  const stdDev = Math.sqrt(variance);

  if (stdDev === 0) return { detected: false };

  for (let i = 0; i < costs.length; i++) {
    if (Math.abs(costs[i] - mean) > stdThreshold * stdDev) {
      return { detected: true, index: i, value: costs[i] };
    }
  }
  return { detected: false };
}

export interface CostTrendAnomaly {
  type: 'cost_spike' | 'success_drop';
  index: number;
  value: number;
  threshold: number;
  message: string;
}

/**
 * Detect anomalies across multiple cost trends.
 * Returns all detected anomalies in chronological order.
 */
export function detectAnomaliesInTrend(
  costs: number[],
  options: { stdThreshold?: number } = {}
): CostTrendAnomaly[] {
  const result: CostTrendAnomaly[] = [];
  const { stdThreshold = 2 } = options;

  if (costs.length < 3) return result;

  const mean = costs.reduce((a, b) => a + b, 0) / costs.length;
  const variance = costs.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / costs.length;
  const stdDev = Math.sqrt(variance);

  if (stdDev === 0) return result;

  for (let i = 0; i < costs.length; i++) {
    const deviation = Math.abs(costs[i] - mean) / stdDev;
    if (deviation > stdThreshold) {
      result.push({
        type: 'cost_spike',
        index: i,
        value: costs[i],
        threshold: stdThreshold,
        message: `Cost at index ${i} is $${costs[i].toFixed(4)} (${deviation.toFixed(1)}σ from mean)`,
      });
    }
  }

  return result;
}