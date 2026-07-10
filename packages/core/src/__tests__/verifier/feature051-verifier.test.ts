import { describe, expect, it } from 'vitest';
import {
  normalizeMcpScore,
  normalizeReviewResult,
  type IVerifier,
  type ReviewParams,
  type ReviewResult,
} from '../../models/verifier/index.js';

class FakeVerifier implements IVerifier {
  readonly id = 'fake-verifier';

  async review(params: ReviewParams): Promise<ReviewResult> {
    return normalizeReviewResult({
      status: 'pass',
      summary: `reviewed ${params.changedFiles.length} files`,
      mcpScore: 87,
      sandboxApproval: { approved: true, reason: 'safe fake review' },
      rawPlan: { steps: [{ id: 'step-1', text: 'Inspect changes', status: 'completed' }] },
    });
  }
}

describe('FEATURE051 - Verifier Types and Base Contract', () => {
  it('allows a fake verifier to satisfy the contract with typed review output', async () => {
    const verifier: IVerifier = new FakeVerifier();

    await expect(verifier.review({
      featureId: 'FEATURE051',
      prompt: 'verify',
      changedFiles: ['src/index.ts'],
      commandsRun: ['npm test -- verifier'],
    })).resolves.toMatchObject({
      status: 'pass',
      summary: 'reviewed 1 files',
      mcpScore: { score: 87, maxScore: 100, normalized: 0.87 },
      sandboxApproval: { approved: true },
      rawPlan: { steps: [{ id: 'step-1', status: 'completed' }] },
    });
  });

  it('normalizes default MCP scores without verifier-specific output assumptions', () => {
    expect(normalizeMcpScore()).toEqual({ score: 0, maxScore: 100, normalized: 0 });
    expect(normalizeMcpScore(75)).toEqual({ score: 75, maxScore: 100, normalized: 0.75 });
    expect(normalizeMcpScore({ score: 3, maxScore: 4 })).toEqual({ score: 3, maxScore: 4, normalized: 0.75 });
  });

  it('normalizes partial review results with safe defaults', () => {
    expect(normalizeReviewResult({ summary: 'needs work' })).toEqual({
      status: 'needs-changes',
      summary: 'needs work',
      findings: [],
      confidenceScore: 0,
      sandboxApproval: { approved: false, reason: 'No sandbox approval was provided.' },
      mcpScore: { score: 0, maxScore: 100, normalized: 0 },
    });
  });
});
