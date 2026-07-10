// packages/core/src/utils/cost-calculator.ts
// Cost calculation utilities for tracking spending per model/provider

import { getModelPricing } from '../config/defaults.js';

export interface CostBreakdown {
  inputTokens: number;
  outputTokens: number;
  inputCostUsd: number;
  outputCostUsd: number;
  totalCostUsd: number;
  provider: string;
  model: string;
}

export interface CostTrackerOptions {
  onCost?: (breakdown: CostBreakdown) => void;
}

/** Calculate cost for a single API call based on token counts and pricing */
export function calculateCallCost(
  inputTokens: number,
  outputTokens: number,
  provider: string,
  modelId: string,
): CostBreakdown {
  const pricing = getModelPricing(provider, modelId);

  // Pricing is per 1K tokens, so divide by 1000
  const inputCostUsd = (inputTokens / 1000) * pricing.input;
  const outputCostUsd = (outputTokens / 1000) * pricing.output;
  const totalCostUsd = inputCostUsd + outputCostUsd;

  return {
    inputTokens,
    outputTokens,
    inputCostUsd: Math.round(inputCostUsd * 1e8) / 1e8, // round to 8 decimals
    outputCostUsd: Math.round(outputCostUsd * 1e8) / 1e8,
    totalCostUsd: Math.round(totalCostUsd * 1e8) / 1e8,
    provider,
    model: modelId,
  };
}

/** Accumulate costs across multiple API calls */
export class CostTracker {
  private totalInputTokens = 0;
  private totalOutputTokens = 0;
  private totalCostUsd = 0;
  private breakdowns: CostBreakdown[] = [];

  constructor(private readonly options: CostTrackerOptions = {}) {}

  add(inputTokens: number, outputTokens: number, provider: string, modelId: string): CostBreakdown {
    const cost = calculateCallCost(inputTokens, outputTokens, provider, modelId);
    this.breakdowns.push(cost);
    this.totalInputTokens += inputTokens;
    this.totalOutputTokens += outputTokens;
    this.totalCostUsd += cost.totalCostUsd;
    this.options.onCost?.(cost);
    return cost;
  }

  get total(): number {
    return Math.round(this.totalCostUsd * 1e8) / 1e8;
  }

  get lastCost(): CostBreakdown | undefined {
    return this.breakdowns[this.breakdowns.length - 1];
  }

  get allBreakdowns(): CostBreakdown[] {
    return [...this.breakdowns];
  }

  isExceeded(budgetUsd: number): boolean {
    return this.totalCostUsd >= budgetUsd;
  }

  remainingBudget(budgetUsd: number): number {
    return Math.max(0, Math.round((budgetUsd - this.totalCostUsd) * 1e8) / 1e8);
  }

  reset(): void {
    this.totalInputTokens = 0;
    this.totalOutputTokens = 0;
    this.totalCostUsd = 0;
    this.breakdowns = [];
  }

  /** Format cost for display */
  formatSummary(): string {
    return `💰 Cost: $${this.total.toFixed(6)} (Input: ${this.totalInputTokens.toLocaleString()} tokens, Output: ${this.totalOutputTokens.toLocaleString()} tokens)`;
  }
}

/** Estimate cost before making an API call based on token counts */
export function estimateCost(
  estimatedInputTokens: number,
  estimatedOutputTokens: number,
  provider: string,
  modelId: string,
): CostBreakdown {
  return calculateCallCost(estimatedInputTokens, estimatedOutputTokens, provider, modelId);
}

/** Calculate cost for a full loop run */
export function estimateLoopCost(params: {
  turnCount: number;
  avgInputTokensPerTurn: number;
  avgOutputTokensPerTurn: number;
  provider: string;
  modelId: string;
}): CostBreakdown[] {
  const { turnCount, avgInputTokensPerTurn, avgOutputTokensPerTurn, provider, modelId } = params;
  const estimates: CostBreakdown[] = [];

  for (let i = 0; i < turnCount; i++) {
    const cost = calculateCallCost(avgInputTokensPerTurn, avgOutputTokensPerTurn, provider, modelId);
    estimates.push(cost);
  }

  return estimates;
}
