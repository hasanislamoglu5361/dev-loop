import type { BenchmarkResult } from './runner.js';

export interface BenchmarkReportInput extends BenchmarkResult {
  qualityScore?: number;
  local?: boolean;
}

export interface BenchmarkReportRow extends BenchmarkReportInput {
  compositeScore: number;
}

export interface BenchmarkReport {
  rows: BenchmarkReportRow[];
  bestOverall?: BenchmarkReportRow;
  bestLocal?: BenchmarkReportRow;
  cheapest?: BenchmarkReportRow;
  fastest?: BenchmarkReportRow;
}

export function buildBenchmarkReport(results: BenchmarkReportInput[]): BenchmarkReport {
  const successful = results.filter(result => result.success);
  const maxCost = Math.max(...successful.map(result => result.costUsd), 0);
  const maxDuration = Math.max(...successful.map(result => result.durationMs), 0);
  const rows = results
    .map(result => ({
      ...result,
      compositeScore: result.success
        ? compositeScore(result, maxCost, maxDuration)
        : 0,
    }))
    .sort((a, b) => b.compositeScore - a.compositeScore || a.modelId.localeCompare(b.modelId));
  const successfulRows = rows.filter(row => row.success);

  return {
    rows,
    bestOverall: successfulRows[0],
    bestLocal: successfulRows.filter(row => row.local).sort((a, b) => b.compositeScore - a.compositeScore || a.modelId.localeCompare(b.modelId))[0],
    cheapest: successfulRows.slice().sort((a, b) => a.costUsd - b.costUsd || b.compositeScore - a.compositeScore || a.modelId.localeCompare(b.modelId))[0],
    fastest: successfulRows.slice().sort((a, b) => a.durationMs - b.durationMs || b.compositeScore - a.compositeScore || a.modelId.localeCompare(b.modelId))[0],
  };
}

function compositeScore(result: BenchmarkReportInput, maxCost: number, maxDuration: number): number {
  const quality = (result.qualityScore ?? (result.success ? 100 : 0)) / 100;
  const costScore = maxCost > 0 ? 1 - (result.costUsd / maxCost) : 1;
  const speedScore = maxDuration > 0 ? 1 - (result.durationMs / maxDuration) : 1;
  const score =
    50 +
    quality * 30 +
    Math.max(0, costScore) * 10 +
    Math.max(0, speedScore) * 10;

  return Math.round(score * 100) / 100;
}
