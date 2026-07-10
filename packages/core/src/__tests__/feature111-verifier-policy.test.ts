import { describe, expect, it, vi } from 'vitest';
import { normalizeReviewResult } from '../models/verifier/base.js';
import { PolicyVerifier } from '../models/verifier/policy.js';
import type { IVerifier, ReviewStatus } from '../models/verifier/types.js';

const params = { featureId: 'F1', prompt: 'diff', changedFiles: [] };
function verifier(id: string, status: ReviewStatus, confidence: number): IVerifier {
  return { id, review: vi.fn(async () => normalizeReviewResult({
    status, summary: id, confidenceScore: confidence,
    sandboxApproval: { approved: status === 'pass', reason: id },
  })) };
}

describe('FEATURE111 verifier policy', () => {
  it('rotates verifiers deterministically', async () => {
    const a = verifier('a', 'pass', 0.9); const b = verifier('b', 'pass', 0.8);
    const policy = new PolicyVerifier({ verifiers: [a, b], strategy: 'round-robin' });
    await policy.review(params); await policy.review(params); await policy.review(params);
    expect(a.review).toHaveBeenCalledTimes(2); expect(b.review).toHaveBeenCalledTimes(1);
  });

  it('requires every parallel verifier to pass when configured', async () => {
    const policy = new PolicyVerifier({ verifiers: [verifier('a', 'pass', 0.9), verifier('b', 'needs-changes', 0.8)], parallel: true, requireAllPass: true });
    await expect(policy.review(params)).resolves.toMatchObject({ status: 'fail', metadata: { verifierCount: 2, requireAll: true } });
  });

  it('converts verifier exceptions into structured failure outcomes', async () => {
    const broken: IVerifier = { id: 'broken', review: async () => { throw new Error('malformed output'); } };
    await expect(new PolicyVerifier({ verifiers: [broken] }).review(params)).resolves.toMatchObject({ status: 'fail', summary: expect.stringContaining('malformed output') });
  });

  it('notifies once when combined confidence is below threshold', async () => {
    const notify = vi.fn(); const policy = new PolicyVerifier({ verifiers: [verifier('a', 'pass', 0.4)], confidenceThreshold: 0.7, onLowConfidence: notify });
    const result = await policy.review(params); expect(result.confidenceScore).toBe(0.4); expect(notify).toHaveBeenCalledOnce();
  });
});
