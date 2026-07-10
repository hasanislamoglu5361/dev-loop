import { describe, expect, it } from 'vitest';
import { ModelProviderError } from '../../models/errors.js';
import { OllamaProvider, type OllamaFetchLike } from '../../models/ollama.js';
import type { ModelProvider } from '../../models/types.js';

function jsonResponse(body: unknown, init: { ok?: boolean; status?: number; statusText?: string } = {}): Response {
  return {
    ok: init.ok ?? true,
    status: init.status ?? 200,
    statusText: init.statusText ?? 'OK',
    json: async () => body,
  } as Response;
}

describe('FEATURE045 - Ollama Provider', () => {
  it('implements the common provider interface and checks health through Ollama port 11434', async () => {
    const calls: string[] = [];
    const fetch: OllamaFetchLike = async input => {
      calls.push(String(input));
      return jsonResponse({ models: [{ name: 'llama3.2:latest' }] });
    };
    const provider: ModelProvider = new OllamaProvider({ fetch });

    await expect(provider.healthCheck()).resolves.toMatchObject({
      ok: true,
      status: 'healthy',
      providerId: 'ollama',
    });
    expect(calls).toEqual(['http://localhost:11434/api/tags']);
  });

  it('lists models from the tags endpoint without assuming OpenAI response shape', async () => {
    const fetch: OllamaFetchLike = async () =>
      jsonResponse({
        models: [
          {
            name: 'llama3.2:latest',
            model: 'llama3.2:latest',
            size: 2019393189,
            details: { parameter_size: '3.2B', quantization_level: 'Q4_K_M' },
          },
        ],
      });
    const provider = new OllamaProvider({ fetch });

    await expect(provider.listModels()).resolves.toEqual([
      expect.objectContaining({
        id: 'llama3.2:latest',
        name: 'llama3.2:latest',
        provider: 'ollama',
        isLocal: true,
        supportsStreaming: true,
      }),
    ]);
  });

  it('generates through the Ollama chat endpoint', async () => {
    const calls: Array<{ url: string; body: unknown }> = [];
    const fetch: OllamaFetchLike = async (input, init) => {
      calls.push({ url: String(input), body: JSON.parse(String(init?.body)) });
      return jsonResponse({
        model: 'llama3.2:latest',
        message: { role: 'assistant', content: 'hello from ollama' },
        done: true,
        prompt_eval_count: 7,
        eval_count: 9,
      });
    };
    const provider = new OllamaProvider({ fetch });

    const result = await provider.generate({
      model: 'llama3.2:latest',
      messages: [{ role: 'user', content: 'hello' }],
    });

    expect(calls).toEqual([
      {
        url: 'http://localhost:11434/api/chat',
        body: {
          model: 'llama3.2:latest',
          messages: [{ role: 'user', content: 'hello' }],
          stream: false,
        },
      },
    ]);
    expect(result).toMatchObject({
      text: 'hello from ollama',
      model: 'llama3.2:latest',
      inputTokens: 7,
      outputTokens: 9,
      finishReason: 'stop',
    });
  });

  it('uses the missing-model hook without pulling models automatically in tests', async () => {
    const missingModels: string[] = [];
    const fetch: OllamaFetchLike = async () =>
      jsonResponse({ error: 'model not found, try pulling it first' }, { ok: false, status: 404, statusText: 'Not Found' });
    const provider = new OllamaProvider({
      fetch,
      onMissingModel: async model => {
        missingModels.push(model);
      },
    });

    await expect(provider.generate({
      model: 'missing-model',
      messages: [{ role: 'user', content: 'hello' }],
    })).rejects.toMatchObject({
      kind: 'missing-model',
      resolution: 'switch',
      action: expect.stringContaining('ollama pull missing-model'),
    });
    expect(missingModels).toEqual(['missing-model']);
  });

  it('classifies timeout and network failures instead of hanging on local server calls', async () => {
    const fetch: OllamaFetchLike = async () => {
      throw Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:11434'), { code: 'ECONNREFUSED' });
    };
    const provider = new OllamaProvider({ fetch, timeoutMs: 1 });

    await expect(provider.generate({
      model: 'llama3.2:latest',
      messages: [{ role: 'user', content: 'hello' }],
    })).rejects.toMatchObject({
      kind: 'network',
      resolution: 'retry',
    });
    await expect(provider.generate({
      model: 'llama3.2:latest',
      messages: [{ role: 'user', content: 'hello' }],
    })).rejects.toBeInstanceOf(ModelProviderError);
  });
});
