import { describe, expect, it } from 'vitest';
import { ApiVerifier, buildVerifierPrompt, translateSqlRequestToReport } from '../../models/verifier/api-verifier.js';
import type { GenerateParams, GenerateResult, ModelInfo, ModelProvider, ProviderHealth } from '../../models/types.js';

class FakeApiProvider implements ModelProvider {
  readonly id = 'fake-api';
  readonly provider = 'fake';
  readonly isLocal = false;
  calls: GenerateParams[] = [];

  async listModels(): Promise<ModelInfo[]> {
    return [];
  }

  async healthCheck(): Promise<ProviderHealth> {
    return { ok: true, status: 'healthy', providerId: this.id, checkedAt: new Date() };
  }

  async generate(params: GenerateParams): Promise<GenerateResult> {
    this.calls.push(params);
    return {
      text: '```json\n{"bugs":[{"severity":"low","message":"API note"}],"confidence":0.5}\n```',
      files: [],
      model: params.model,
    };
  }
}

describe('FEATURE055 - API Verifier', () => {
  it('uses the generic model provider interface for API reviews', async () => {
    const provider = new FakeApiProvider();
    const verifier = new ApiVerifier({ provider, model: 'fake-review-model' });

    await expect(verifier.review({
      featureId: 'FEATURE055',
      prompt: 'review',
      changedFiles: ['src/a.ts'],
    })).resolves.toMatchObject({
      status: 'needs-changes',
      findings: [{ severity: 'info', message: 'API note' }],
    });
    expect(provider.calls[0]).toMatchObject({
      model: 'fake-review-model',
      messages: [{ role: 'user', content: expect.stringContaining('FEATURE055') }],
    });
  });

  it('shares the verifier prompt builder across CLI and API verifiers', () => {
    expect(buildVerifierPrompt({
      featureId: 'FEATURE055',
      prompt: 'review',
      changedFiles: ['src/a.ts'],
      diff: 'diff',
      testOutput: 'tests',
    })).toContain('diff');
  });

  it('refuses non-SELECT SQL translation through reporting helper without executing SQL', () => {
    expect(translateSqlRequestToReport('SELECT * FROM loop_history')).toEqual({
      ok: true,
      sql: 'SELECT * FROM loop_history',
    });
    expect(translateSqlRequestToReport('DELETE FROM loop_history')).toEqual({
      ok: false,
      reason: 'Only SELECT statements are allowed for verifier reporting.',
    });
  });
});
