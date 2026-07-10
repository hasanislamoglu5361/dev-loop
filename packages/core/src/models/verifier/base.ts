import type { McpScore, ReviewResult, SandboxApproval } from './types.js';

export type McpScoreInput = number | Partial<McpScore> | undefined;

export type ReviewResultInput = Partial<Omit<ReviewResult, 'mcpScore' | 'sandboxApproval'>> & {
  mcpScore?: McpScoreInput;
  sandboxApproval?: Partial<SandboxApproval>;
};

export function normalizeMcpScore(input?: McpScoreInput): McpScore {
  if (typeof input === 'number') {
    return scoreFrom(input, 100);
  }

  const score = finiteNumber(input?.score) ?? 0;
  const maxScore = finiteNumber(input?.maxScore) ?? 100;
  return scoreFrom(score, maxScore);
}

export function normalizeReviewResult(input: ReviewResultInput): ReviewResult {
  return {
    status: input.status ?? 'needs-changes',
    summary: input.summary ?? 'Verifier did not provide a summary.',
    findings: input.findings ?? [],
    confidenceScore: clamp(finiteNumber(input.confidenceScore) ?? 0, 0, 1),
    sandboxApproval: {
      approved: input.sandboxApproval?.approved ?? false,
      reason: input.sandboxApproval?.reason ?? 'No sandbox approval was provided.',
      ...(input.sandboxApproval?.requiredCommands !== undefined
        ? { requiredCommands: input.sandboxApproval.requiredCommands }
        : {}),
    },
    mcpScore: normalizeMcpScore(input.mcpScore),
    ...(input.rawPlan !== undefined ? { rawPlan: input.rawPlan } : {}),
    ...(input.rawOutput !== undefined ? { rawOutput: input.rawOutput } : {}),
    ...(input.metadata !== undefined ? { metadata: input.metadata } : {}),
  };
}

function scoreFrom(score: number, maxScore: number): McpScore {
  const safeMax = maxScore > 0 ? maxScore : 100;
  const safeScore = clamp(score, 0, safeMax);
  return {
    score: safeScore,
    maxScore: safeMax,
    normalized: safeScore / safeMax,
  };
}

function finiteNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
