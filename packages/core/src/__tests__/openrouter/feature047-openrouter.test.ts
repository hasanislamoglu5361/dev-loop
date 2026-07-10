import { describe, expect, it } from 'vitest';
import {
  OpenRouterProvider,
  selectCheapestOpenRouterModel,
  type OpenRouterModel,
} from '../../models/providers/openrouter.js';
import type { OpenAICompatibleFetch } from '../../models/providers/openai.js';

function jsonResponse(body: unknown, init: { ok?: boolean; status?: number; statusText?: string } = {}): Response {
  return {
    ok: init.ok ?? true,
    status: init.status ?? 200,
    statusText: init.statusText ?? 'OK',
    json: async () => body,
  } as Response;
}

describe('FEATURE047 - OpenRouter Provider', () => {
  it('keeps OpenRouter model ids distinct from OpenAI model ids during generation', async () => {
    const calls: Array<{ url: string; body: unknown }> = [];
    const fetch: OpenAICompatibleFetch = async (input, init) => {
      calls.push({ url: String(input), body: JSON.parse(String(init?.body)) });
      return jsonResponse({
        model: 'anthropic/claude-3.5-sonnet',
        choices: [{ message: { content: 'router result' }, finish_reason: 'stop' }],
      });
    };
    const provider = new OpenRouterProvider({ apiKey: 'sk-or-secret-value-123456', fetch });

    await expect(provider.generate({
      model: 'anthropic/claude-3.5-sonnet',
      messages: [{ role: 'user', content: 'hello' }],
    })).resolves.toMatchObject({ text: 'router result', model: 'anthropic/claude-3.5-sonnet' });
    expect(calls[0]).toMatchObject({
      url: 'https://openrouter.ai/api/v1/chat/completions',
      body: expect.objectContaining({ model: 'anthropic/claude-3.5-sonnet' }),
    });
  });

  it('lists OpenRouter models when the API provides model metadata', async () => {
    const fetch: OpenAICompatibleFetch = async () =>
      jsonResponse({
        data: [
          {
            id: 'openai/gpt-4o-mini',
            name: 'GPT-4o Mini via OpenRouter',
            context_length: 128000,
            pricing: { prompt: '0.00000015', completion: '0.00000060' },
          },
        ],
      });
    const provider = new OpenRouterProvider({ apiKey: 'sk-or-secret-value-123456', fetch });

    await expect(provider.listModels()).resolves.toEqual([
      expect.objectContaining({
        id: 'openai/gpt-4o-mini',
        provider: 'openrouter',
        contextWindow: 128000,
      }),
    ]);
  });

  it('selects the cheapest capable OpenRouter model without treating ids as OpenAI ids', () => {
    const models: OpenRouterModel[] = [
      { id: 'openai/gpt-4o', contextWindow: 128000, promptPrice: 5, completionPrice: 15 },
      { id: 'anthropic/claude-haiku', contextWindow: 200000, promptPrice: 0.25, completionPrice: 1.25 },
      { id: 'openai/gpt-3.5-turbo', contextWindow: 4096, promptPrice: 0.1, completionPrice: 0.2 },
    ];

    expect(selectCheapestOpenRouterModel(models, { minContextWindow: 32000 })).toEqual({
      id: 'anthropic/claude-haiku',
      contextWindow: 200000,
      promptPrice: 0.25,
      completionPrice: 1.25,
    });
  });
});
