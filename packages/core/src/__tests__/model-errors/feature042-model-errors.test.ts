import { describe, expect, it } from 'vitest';
import {
  classifyModelError,
  ModelProviderError,
  type ModelErrorKind,
  type ModelErrorResolution,
} from '../../models/errors.js';

const CASES: Array<{
  label: string;
  input: unknown;
  kind: ModelErrorKind;
  resolution: ModelErrorResolution;
}> = [
  {
    label: 'rate limit with retry-after',
    input: { status: 429, headers: { 'retry-after': '17' }, message: 'Rate limit exceeded' },
    kind: 'rate-limit',
    resolution: 'retry',
  },
  {
    label: 'invalid API key',
    input: { status: 401, message: 'Invalid API key sk-live-secret-value' },
    kind: 'invalid-key',
    resolution: 'fail',
  },
  {
    label: 'missing model',
    input: { status: 404, message: 'model llama-3.3 not found' },
    kind: 'missing-model',
    resolution: 'switch',
  },
  {
    label: 'token limit',
    input: new Error('max_tokens must be less than or equal to 4096'),
    kind: 'token-limit',
    resolution: 'switch',
  },
  {
    label: 'context too long',
    input: { code: 'context_length_exceeded', message: 'This model maximum context length is 8192 tokens.' },
    kind: 'context-too-long',
    resolution: 'switch',
  },
  {
    label: 'timeout',
    input: { code: 'ETIMEDOUT', message: 'request timed out after 30000ms' },
    kind: 'timeout',
    resolution: 'retry',
  },
  {
    label: 'VRAM exhausted',
    input: { message: 'CUDA out of memory while loading model' },
    kind: 'vram',
    resolution: 'switch',
  },
  {
    label: 'CLI missing',
    input: { code: 'ENOENT', syscall: 'spawn ollama', message: 'spawn ollama ENOENT' },
    kind: 'cli-missing',
    resolution: 'fail',
  },
  {
    label: 'network',
    input: { code: 'ECONNREFUSED', message: 'connect ECONNREFUSED 127.0.0.1:11434' },
    kind: 'network',
    resolution: 'retry',
  },
];

describe('FEATURE042 - Model Error Classification', () => {
  it.each(CASES)('classifies $label as $kind and returns loop-engine resolution', ({ input, kind, resolution }) => {
    const classified = classifyModelError(input, { providerId: 'fake-provider', model: 'fake-model' });

    expect(classified.kind).toBe(kind);
    expect(classified.resolution).toBe(resolution);
    expect(classified.providerId).toBe('fake-provider');
    expect(classified.model).toBe('fake-model');
    expect(classified.message.length).toBeGreaterThan(0);
    expect(classified.action.length).toBeGreaterThan(0);
  });

  it('preserves retry-after data for rate-limit errors', () => {
    const classified = classifyModelError({
      status: 429,
      headers: new Map([['retry-after', '8']]),
      message: 'too many requests',
    });

    expect(classified).toMatchObject({
      kind: 'rate-limit',
      resolution: 'retry',
      retryAfterMs: 8000,
    });
  });

  it('redacts secret values from normalized messages and details', () => {
    const classified = classifyModelError({
      status: 401,
      message: 'Invalid Authorization bearer sk-live-secret-value',
      apiKey: 'sk-live-secret-value',
      nested: { token: 'token-secret-value' },
    });

    const serialized = JSON.stringify(classified);
    expect(serialized).not.toContain('sk-live-secret-value');
    expect(serialized).not.toContain('token-secret-value');
    expect(serialized).toContain('[REDACTED]');
  });

  it('wraps normalized data in ModelProviderError without exposing raw SDK errors', () => {
    const error = new ModelProviderError(
      classifyModelError({ status: 400, message: 'context length exceeded' }),
    );

    expect(error).toBeInstanceOf(ModelProviderError);
    expect(error.kind).toBe('context-too-long');
    expect(error.resolution).toBe('switch');
    expect(error.cause).toBeUndefined();
    expect(error.toJSON()).toMatchObject({
      code: 'model.context-too-long',
      action: expect.any(String),
    });
  });
});
