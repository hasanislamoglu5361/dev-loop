import { normalizeReviewResult } from './base.js';
import type { IVerifier, ReviewParams, ReviewResult } from './types.js';

export interface VerifierPolicyOptions {
  verifiers: IVerifier[];
  strategy?: 'round-robin' | 'best-score';
  parallel?: boolean;
  requireAllPass?: boolean;
  confidenceThreshold?: number;
  onLowConfidence?: (result: ReviewResult) => void | Promise<void>;
}

export class PolicyVerifier implements IVerifier {
  readonly id = 'policy-verifier';
  private cursor = 0;
  private readonly scores = new Map<string, number>();
  constructor(private readonly options: VerifierPolicyOptions) {
    if (options.verifiers.length === 0) throw new Error('Verifier policy requires at least one verifier.');
  }

  async review(params: ReviewParams): Promise<ReviewResult> {
    const selected = this.options.parallel ? this.options.verifiers : [this.select()];
    const settled = await Promise.allSettled(selected.map(verifier => verifier.review(params)));
    const results = settled.map((entry, index) => entry.status === 'fulfilled'
      ? normalizeReviewResult(entry.value)
      : normalizeReviewResult({ status: 'fail', summary: `${selected[index].id} failed: ${String(entry.reason)}` }));
    results.forEach((result, index) => this.scores.set(selected[index].id, result.confidenceScore));
    const combined = combine(results, this.options.requireAllPass ?? true);
    if (combined.confidenceScore < (this.options.confidenceThreshold ?? 0.7)) await this.options.onLowConfidence?.(combined);
    return combined;
  }

  private select(): IVerifier {
    if (this.options.strategy === 'best-score' && this.scores.size > 0) {
      return [...this.options.verifiers].sort((a, b) => (this.scores.get(b.id) ?? -1) - (this.scores.get(a.id) ?? -1))[0];
    }
    const verifier = this.options.verifiers[this.cursor % this.options.verifiers.length];
    this.cursor += 1;
    return verifier;
  }
}

function combine(results: ReviewResult[], requireAll: boolean): ReviewResult {
  const passed = requireAll ? results.every(result => result.status === 'pass') : results.some(result => result.status === 'pass');
  const findings = results.flatMap(result => result.findings);
  return normalizeReviewResult({
    status: passed ? 'pass' : findings.length ? 'needs-changes' : 'fail',
    summary: results.map(result => result.summary).join('\n'),
    findings,
    confidenceScore: Math.min(...results.map(result => result.confidenceScore)),
    sandboxApproval: {
      approved: results.every(result => result.sandboxApproval.approved),
      reason: results.map(result => result.sandboxApproval.reason).join('; '),
    },
    mcpScore: Math.min(...results.map(result => result.mcpScore.normalized)) * 100,
    metadata: { verifierCount: results.length, requireAll },
  });
}
