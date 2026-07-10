import { describe, expect, it } from 'vitest';
import { ModelProviderError } from '../../models/errors.js';
import { GoogleProvider, type GoogleClientLike } from '../../models/providers/google.js';

describe('FEATURE048 - Google Gemini Provider', () => {
  it('requires an API key without exposing secrets', () => {
    expect(() => new GoogleProvider({ env: {} })).toThrow(ModelProviderError);
    expect(() => new GoogleProvider({ apiKey: '' })).toThrow(/API key/i);
  });

  it('generates from Gemini candidates without assuming Anthropic or OpenAI response shapes', async () => {
    const calls: unknown[] = [];
    const client: GoogleClientLike = {
      generateContent: async input => {
        calls.push(input);
        return {
          response: {
            candidates: [{ content: { parts: [{ text: 'gemini result' }] }, finishReason: 'STOP' }],
            usageMetadata: { promptTokenCount: 5, candidatesTokenCount: 6 },
          },
        };
      },
    };
    const provider = new GoogleProvider({ apiKey: 'google-secret-value-123456', client });

    const result = await provider.generate({
      model: 'gemini-1.5-flash',
      messages: [{ role: 'user', content: 'hello' }],
      maxTokens: 32,
    });

    expect(calls).toEqual([
      {
        model: 'gemini-1.5-flash',
        contents: [{ role: 'user', parts: [{ text: 'hello' }] }],
        generationConfig: { maxOutputTokens: 32 },
      },
    ]);
    expect(result).toMatchObject({
      text: 'gemini result',
      model: 'gemini-1.5-flash',
      inputTokens: 5,
      outputTokens: 6,
      finishReason: 'stop',
    });
    expect(result.costUsd).toBeGreaterThan(0);
  });

  it('handles missing Gemini usage metadata conservatively', async () => {
    const client: GoogleClientLike = {
      generateContent: async () => ({
        response: {
          candidates: [{ content: { parts: [{ text: 'ok' }] }, finishReason: 'STOP' }],
        },
      }),
    };
    const provider = new GoogleProvider({ apiKey: 'google-secret-value-123456', client });

    await expect(provider.generate({
      model: 'gemini-1.5-flash',
      messages: [{ role: 'user', content: 'hello' }],
    })).resolves.toMatchObject({ text: 'ok', costUsd: 0 });
  });

  it('normalizes provider-specific Gemini errors', async () => {
    const client: GoogleClientLike = {
      generateContent: async () => {
        throw Object.assign(new Error('API key not valid'), { status: 403 });
      },
    };
    const provider = new GoogleProvider({ apiKey: 'google-secret-value-123456', client });

    await expect(provider.generate({
      model: 'gemini-1.5-flash',
      messages: [{ role: 'user', content: 'hello' }],
    })).rejects.toMatchObject({ kind: 'invalid-key', resolution: 'fail' });
  });
});
