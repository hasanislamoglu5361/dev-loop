// packages/core/src/analytics/summary.ts
// Executive summary generation for analytics data.

export interface ExecutiveSummary {
  period: string;
  totalLoops: number;
  successRate: number;
  totalCostUsd: number;
  anomaliesDetected: boolean;
}

/**
 * Generate an executive summary from aggregated analytics data.
 * Rounds numeric values to avoid floating point precision issues.
 */
export function generateExecutiveSummary(
  totalLoops: number,
  successRate: number,
  totalCostUsd: number,
  period: string,
  anomaliesDetected: boolean = false
): ExecutiveSummary {
  return {
    period,
    totalLoops,
    successRate: Math.round(successRate * 100) / 100,
    totalCostUsd: Math.round(totalCostUsd * 100) / 100,
    anomaliesDetected,
  };
}

export interface SummaryInput {
  totalLoops?: number;
  successRate?: number;
  totalCostUsd?: number;
  period?: string;
  anomaliesDetected?: boolean;
}

/**
 * Generate an executive summary from optional input fields.
 * Missing values default to zero/false. Period defaults to 'Unknown'.
 */
export function buildSummaryFromInput(input: SummaryInput): ExecutiveSummary {
  return generateExecutiveSummary(
    input.totalLoops ?? 0,
    input.successRate ?? 0,
    input.totalCostUsd ?? 0,
    input.period ?? 'Unknown',
    input.anomaliesDetected ?? false
  );
}