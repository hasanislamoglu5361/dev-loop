import { z } from 'zod';
import { normalizeMcpScore, normalizeReviewResult } from './base.js';
import type { ReviewFinding, ReviewResult } from './types.js';

const bugSchema = z.object({
  severity: z.enum(['low', 'medium', 'high', 'critical']),
  message: z.string().min(1),
  file: z.string().optional(),
  line: z.number().int().positive().optional(),
  ruleId: z.string().optional(),
});

const verifierOutputSchema = z.object({
  bugs: z.array(bugSchema).default([]),
  confidence: z.number().min(0).max(1).default(0),
  mcp_score: z.union([
    z.number(),
    z.object({
      score: z.number(),
      maxScore: z.number().optional(),
      max_score: z.number().optional(),
    }),
  ]).optional(),
  uncertain_fields: z.array(z.string()).default([]),
  summary: z.string().optional(),
});

type ParsedVerifierOutput = z.infer<typeof verifierOutputSchema>;

export function parseVerifierOutput(output: string): ReviewResult {
  for (const block of jsonFenceBlocks(output)) {
    try {
      const parsed = verifierOutputSchema.parse(JSON.parse(block));
      return reviewFromParsed(parsed, output);
    } catch {
      continue;
    }
  }

  return fallbackReview('Verifier output did not contain valid JSON.', output);
}

function* jsonFenceBlocks(output: string): Iterable<string> {
  const blockPattern = /```(?:json|JSON)\s*([\s\S]*?)```/g;
  for (const match of output.matchAll(blockPattern)) {
    yield match[1] ?? '';
  }
}

function reviewFromParsed(parsed: ParsedVerifierOutput, rawOutput: string): ReviewResult {
  const findings = parsed.bugs.map(toFinding);
  const mcpInput = typeof parsed.mcp_score === 'object' && parsed.mcp_score !== null
    ? { score: parsed.mcp_score.score, maxScore: parsed.mcp_score.maxScore ?? parsed.mcp_score.max_score }
    : parsed.mcp_score;

  return normalizeReviewResult({
    status: findings.length === 0 ? 'pass' : findings.some(finding => finding.severity === 'error') ? 'fail' : 'needs-changes',
    summary: parsed.summary ?? (findings.length === 0 ? 'Verifier reported no bugs.' : `Verifier reported ${findings.length} issue(s).`),
    findings,
    confidenceScore: parsed.confidence,
    mcpScore: normalizeMcpScore(mcpInput),
    rawOutput,
    metadata: { uncertainFields: parsed.uncertain_fields },
  });
}

function toFinding(bug: z.infer<typeof bugSchema>): ReviewFinding {
  return {
    severity: bug.severity === 'low' ? 'info' : bug.severity === 'medium' ? 'warning' : 'error',
    message: bug.message,
    ...(bug.file !== undefined ? { file: bug.file } : {}),
    ...(bug.line !== undefined ? { line: bug.line } : {}),
    ...(bug.ruleId !== undefined ? { ruleId: bug.ruleId } : {}),
  };
}

function fallbackReview(message: string, rawOutput: string): ReviewResult {
  return normalizeReviewResult({
    status: 'needs-changes',
    summary: message,
    findings: [{ severity: 'warning', message }],
    confidenceScore: 0,
    rawOutput,
    metadata: { rawSeverity: 'medium' },
  });
}
