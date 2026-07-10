import { describe, expect, it } from 'vitest';
import { ModelProviderError } from '../../models/errors.js';
import { LMStudioProvider, type FetchLike } from '../../models/lmstudio.js';
import type { ModelProvider } from '../../models/types.js';

function jsonResponse(body: unknown, init: { ok?: boolean; status?: number } = {}): Response {
  return {
    ok: init.ok ?? true,
    status: init.status ?? 200,
    statusText: init.ok === false ? 'Bad Request' : 'OK',
    json: async () => body,
  } as Response;
}

function streamResponse(chunks: string[]): Response {
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    body: (async function* () {
      for (const chunk of chunks) {
        yield new TextEncoder().encode(chunk);
      }
    })(),
  } as unknown as Response;
}

describe('FEATURE044 - LM Studio Provider', () => {
  it('implements the common provider interface and checks health through /v1/models', async () => {
    const calls: string[] = [];
    const fetch: FetchLike = async input => {
      calls.push(String(input));
      return jsonResponse({ data: [{ id: 'local-model', context_length: 4096 }] });
    };
    const provider: ModelProvider = new LMStudioProvider({ fetch });

    const health = await provider.healthCheck();

    expect(health).toMatchObject({
      ok: true,
      status: 'healthy',
      providerId: 'lmstudio',
    });
    expect(calls).toEqual(['http://localhost:1234/v1/models']);
    expect((provider as LMStudioProvider).getSessionState()).toMatchObject({
      warm: true,
      lastHealthOk: true,
      lastModelCount: 1,
    });
  });

  it('reports unhealthy server state without throwing raw network errors from health checks', async () => {
    const fetch: FetchLike = async () => {
      throw Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:1234'), { code: 'ECONNREFUSED' });
    };
    const provider = new LMStudioProvider({ fetch });

    await expect(provider.healthCheck()).resolves.toMatchObject({
      ok: false,
      status: 'unavailable',
      message: expect.stringContaining('network'),
    });
    expect(provider.getSessionState()).toMatchObject({
      warm: false,
      lastHealthOk: false,
    });
  });

  it('lists LM Studio models without assuming one is already loaded', async () => {
    const fetch: FetchLike = async () => jsonResponse({ data: [{ id: 'model-a' }, { id: 'model-b', max_context_length: 8192 }] });
    const provider = new LMStudioProvider({ fetch });

    await expect(provider.listModels()).resolves.toEqual([
      expect.objectContaining({ id: 'model-a', provider: 'lmstudio', isLocal: true }),
      expect.objectContaining({ id: 'model-b', contextWindow: 8192 }),
    ]);
    expect(provider.getSessionState().lastModelCount).toBe(2);
  });

  it('generates chat completions through /v1/chat/completions', async () => {
    const calls: Array<{ url: string; body: unknown }> = [];
    const fetch: FetchLike = async (input, init) => {
      calls.push({ url: String(input), body: JSON.parse(String(init?.body)) });
      return jsonResponse({
        model: 'local-model',
        choices: [{ message: { content: 'hello from lm studio' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 4, completion_tokens: 5 },
      });
    };
    const provider = new LMStudioProvider({ fetch });

    const result = await provider.generate({
      model: 'local-model',
      messages: [{ role: 'user', content: 'hello' }],
      temperature: 0.2,
      maxTokens: 32,
    });

    expect(calls).toEqual([
      {
        url: 'http://localhost:1234/v1/chat/completions',
        body: {
          model: 'local-model',
          messages: [{ role: 'user', content: 'hello' }],
          temperature: 0.2,
          max_tokens: 32,
          stream: false,
        },
      },
    ]);
    expect(result).toMatchObject({
      text: 'hello from lm studio',
      model: 'local-model',
      inputTokens: 4,
      outputTokens: 5,
      finishReason: 'stop',
    });
    expect(provider.getSessionState().lastModel).toBe('local-model');
  });

  it('supports streaming chat completions from mocked SSE response bodies', async () => {
    const fetch: FetchLike = async () =>
      streamResponse([
        'data: {"choices":[{"delta":{"content":"hel"}}]}\n\n',
        'data: {"choices":[{"delta":{"content":"lo"}}]}\n\n',
        'data: [DONE]\n\n',
      ]);
    const provider = new LMStudioProvider({ fetch });

    const events = [];
    for await (const event of provider.streamGenerate({
      model: 'local-model',
      messages: [{ role: 'user', content: 'hello' }],
    })) {
      events.push(event);
    }

    expect(events).toEqual([
      { type: 'text-delta', text: 'hel' },
      { type: 'text-delta', text: 'lo' },
      expect.objectContaining({ type: 'done', result: expect.objectContaining({ text: 'hello' }) }),
    ]);
  });

  it('classifies timeout and network errors for generation', async () => {
    const fetch: FetchLike = async () => {
      throw Object.assign(new Error('request timed out'), { code: 'ETIMEDOUT' });
    };
    const provider = new LMStudioProvider({ fetch });

    await expect(provider.generate({
      model: 'local-model',
      messages: [{ role: 'user', content: 'hello' }],
      timeoutMs: 1,
    })).rejects.toMatchObject({
      kind: 'timeout',
      resolution: 'retry',
    });
    await expect(provider.generate({
      model: 'local-model',
      messages: [{ role: 'user', content: 'hello' }],
    })).rejects.toBeInstanceOf(ModelProviderError);
  });
});
