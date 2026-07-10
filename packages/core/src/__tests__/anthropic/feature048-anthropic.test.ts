import { describe, expect, it } from 'vitest';
import { ModelProviderError } from '../../models/errors.js';
import { AnthropicProvider, type AnthropicClientLike } from '../../models/providers/anthropic.js';

describe('FEATURE048 - Anthropic Provider', () => {
  it('requires an API key without exposing secrets', () => {
    expect(() => new AnthropicProvider({ env: {} })).toThrow(ModelProviderError);
    expect(() => new AnthropicProvider({ apiKey: '' })).toThrow(/API key/i);
  });

  it('generates from Anthropic content blocks and estimates token cost', async () => {
    const calls: unknown[] = [];
    const client: AnthropicClientLike = {
      messages: {
        create: async input => {
          calls.push(input);
          return {
            model: 'claude-3-5-sonnet-latest',
            content: [{ type: 'text', text: 'anthropic result' }],
            usage: { input_tokens: 12, output_tokens: 8 },
            stop_reason: 'end_turn',
          };
        },
      },
    };
    const provider = new AnthropicProvider({ apiKey: 'sk-ant-secret-value-123456', client });

    const result = await provider.generate({
      model: 'claude-3-5-sonnet-latest',
      messages: [{ role: 'user', content: 'hello' }],
      maxTokens: 128,
    });

    expect(calls).toEqual([
      {
        model: 'claude-3-5-sonnet-latest',
        max_tokens: 128,
        messages: [{ role: 'user', content: 'hello' }],
      },
    ]);
    expect(result).toMatchObject({
      text: 'anthropic result',
      model: 'claude-3-5-sonnet-latest',
      inputTokens: 12,
      outputTokens: 8,
      finishReason: 'stop',
    });
    expect(result.costUsd).toBeGreaterThan(0);
  });

  it('adds extended thinking only for supported Anthropic models', async () => {
    const calls: unknown[] = [];
    const client: AnthropicClientLike = {
      messages: {
        create: async input => {
          calls.push(input);
          return { content: [{ type: 'text', text: 'ok' }], usage: {} };
        },
      },
    };
    const provider = new AnthropicProvider({
      apiKey: 'sk-ant-secret-value-123456',
      client,
      extendedThinking: true,
      thinkingBudgetTokens: 1024,
    });

    await provider.generate({ model: 'claude-3-7-sonnet-latest', messages: [{ role: 'user', content: 'think' }] });
    await provider.generate({ model: 'claude-3-haiku-20240307', messages: [{ role: 'user', content: 'quick' }] });

    expect(calls[0]).toMatchObject({ thinking: { type: 'enabled', budget_tokens: 1024 } });
    expect(calls[1]).not.toHaveProperty('thinking');
  });

  it('normalizes provider-specific Anthropic errors', async () => {
    const client: AnthropicClientLike = {
      messages: {
        create: async () => {
          throw Object.assign(new Error('rate_limit_error: slow down'), { status: 429 });
        },
      },
    };
    const provider = new AnthropicProvider({ apiKey: 'sk-ant-secret-value-123456', client });

    await expect(provider.generate({
      model: 'claude-3-5-sonnet-latest',
      messages: [{ role: 'user', content: 'hello' }],
    })).rejects.toMatchObject({ kind: 'rate-limit', resolution: 'retry' });
  });
});
