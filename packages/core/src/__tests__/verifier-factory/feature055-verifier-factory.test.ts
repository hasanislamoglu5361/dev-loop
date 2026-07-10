import { describe, expect, it } from 'vitest';
import { createVerifier, type VerifierFactoryConfig } from '../../models/verifier/factory.js';
import { ClaudeCodeCliVerifier } from '../../models/verifier/claude-code-cli.js';
import { ClaudeCliVerifier } from '../../models/verifier/claude-cli.js';
import { CodexCliVerifier } from '../../models/verifier/codex-cli.js';
import { ApiVerifier } from '../../models/verifier/api-verifier.js';
import type { GenerateParams, GenerateResult, ModelInfo, ModelProvider, ProviderHealth } from '../../models/types.js';

class FakeApiProvider implements ModelProvider {
  readonly id = 'fake-api';
  readonly provider = 'fake';
  readonly isLocal = false;

  async listModels(): Promise<ModelInfo[]> {
    return [];
  }

  async healthCheck(): Promise<ProviderHealth> {
    return { ok: true, status: 'healthy', providerId: this.id, checkedAt: new Date() };
  }

  async generate(params: GenerateParams): Promise<GenerateResult> {
    return { text: '```json\n{"bugs":[],"confidence":0.9}\n```', files: [], model: params.model };
  }
}

describe('FEATURE055 - verifier factory', () => {
  it('constructs a ClaudeCodeCliVerifier for kind "claude-code-cli"', () => {
    const config: VerifierFactoryConfig = {
      kind: 'claude-code-cli',
      options: { promptFile: '/tmp/prompt.md' },
    };
    const verifier = createVerifier(config);
    expect(verifier).toBeInstanceOf(ClaudeCodeCliVerifier);
    expect(typeof verifier.review).toBe('function');
  });

  it('constructs a ClaudeCliVerifier for kind "claude-cli"', () => {
    const config: VerifierFactoryConfig = {
      kind: 'claude-cli',
      options: { promptFile: '/tmp/prompt.md' },
    };
    const verifier = createVerifier(config);
    expect(verifier).toBeInstanceOf(ClaudeCliVerifier);
    expect(typeof verifier.review).toBe('function');
  });

  it('constructs a CodexCliVerifier for kind "codex-cli"', () => {
    const config: VerifierFactoryConfig = {
      kind: 'codex-cli',
      options: { promptFile: '/tmp/prompt.md' },
    };
    const verifier = createVerifier(config);
    expect(verifier).toBeInstanceOf(CodexCliVerifier);
    expect(typeof verifier.review).toBe('function');
  });

  it('constructs an ApiVerifier for kind "api-verifier"', () => {
    const config: VerifierFactoryConfig = {
      kind: 'api-verifier',
      options: { provider: new FakeApiProvider(), model: 'fake-review-model' },
    };
    const verifier = createVerifier(config);
    expect(verifier).toBeInstanceOf(ApiVerifier);
    expect(typeof verifier.review).toBe('function');
  });

  it('throws for an unknown verifier kind', () => {
    const bogus = { kind: 'not-a-real-kind', options: {} } as unknown as VerifierFactoryConfig;
    expect(() => createVerifier(bogus)).toThrow(/Unknown verifier kind/);
  });
});
