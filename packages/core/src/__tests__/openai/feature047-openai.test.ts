import { describe, expect, it } from 'vitest';
import { ModelProviderError } from '../../models/errors.js';
import { OpenAIProvider, type OpenAICompatibleFetch } from '../../models/providers/openai.js';
import type { ModelProvider } from '../../models/types.js';

function jsonResponse(body: unknown, init: { ok?: boolean; status?: number; statusText?: string } = {}): Response {
  return {
    ok: init.ok ?? true,
    status: init.status ?? 200,
    statusText: init.statusText ?? 'OK',
    json: async () => body,
  } as Response;
}

describe('FEATURE047 - OpenAI Provider', () => {
  it('requires an API key without exposing the missing or provided value', () => {
    expect(() => new OpenAIProvider({ env: {} })).toThrow(ModelProviderError);
    expect(() => new OpenAIProvider({ apiKey: '' })).toThrow(/API key/i);
  });

  it('implements the common provider interface and lists models', async () => {
    const fetch: OpenAICompatibleFetch = async () => jsonResponse({ data: [{ id: 'gpt-4o-mini' }] });
    const provider: ModelProvider = new OpenAIProvider({ apiKey: 'sk-test-secret-value-123456', fetch });

    await expect(provider.listModels()).resolves.toEqual([
      expect.objectContaining({ id: 'gpt-4o-mini', provider: 'openai', isLocal: false }),
    ]);
  });

  it('generates chat completions with Authorization header redacted from errors', async () => {
    const calls: Array<{ url: string; authorization: string | undefined; body: unknown }> = [];
    const fetch: OpenAICompatibleFetch = async (input, init) => {
      calls.push({
        url: String(input),
        authorization: init?.headers?.authorization,
        body: JSON.parse(String(init?.body)),
      });
      return jsonResponse({
        model: 'gpt-4o-mini',
        choices: [{ message: { content: 'cloud result' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 11, completion_tokens: 13 },
      });
    };
    const provider = new OpenAIProvider({ apiKey: 'sk-test-secret-value-123456', fetch });

    const result = await provider.generate({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: 'hello' }],
      maxTokens: 64,
    });

    expect(calls).toEqual([
      {
        url: 'https://api.openai.com/v1/chat/completions',
        authorization: 'Bearer sk-test-secret-value-123456',
        body: {
          model: 'gpt-4o-mini',
          messages: [{ role: 'user', content: 'hello' }],
          max_tokens: 64,
          stream: false,
        },
      },
    ]);
    expect(result).toMatchObject({
      text: 'cloud result',
      model: 'gpt-4o-mini',
      inputTokens: 11,
      outputTokens: 13,
      finishReason: 'stop',
    });
  });

  it('classifies rate limit responses and preserves retry-after data', async () => {
    const fetch: OpenAICompatibleFetch = async () =>
      jsonResponse({ error: { message: 'Rate limit exceeded' } }, { ok: false, status: 429, statusText: 'Too Many Requests' });
    const provider = new OpenAIProvider({ apiKey: 'sk-test-secret-value-123456', fetch });

    await expect(provider.generate({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: 'hello' }],
    })).rejects.toMatchObject({
      kind: 'rate-limit',
      resolution: 'retry',
    });
  });
});
