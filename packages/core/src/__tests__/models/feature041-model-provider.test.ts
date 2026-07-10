import { describe, expect, it } from 'vitest';
import { ModelError } from '../../errors.js';
import { BaseModelProvider } from '../../models/base.js';
import type {
  GenerateParams,
  GenerateResult,
  ModelInfo,
  ModelProvider,
  ModelStreamEvent,
  ProviderHealth,
} from '../../models/types.js';

class FakeProvider extends BaseModelProvider implements ModelProvider {
  constructor() {
    super({ id: 'fake-provider', provider: 'fake', isLocal: false });
  }

  async listModels(): Promise<ModelInfo[]> {
    return [
      {
        id: 'fake-model',
        name: 'Fake Model',
        provider: this.provider,
        contextWindow: 8192,
        maxOutputTokens: 2048,
        supportsStreaming: true,
      },
    ];
  }

  async healthCheck(): Promise<ProviderHealth> {
    return this.createHealthCheck({ ok: true, latencyMs: 1 });
  }

  async generate(params: GenerateParams): Promise<GenerateResult> {
    return {
      text: `generated:${params.messages.at(-1)?.content ?? ''}`,
      files: [
        {
          path: 'src/example.ts',
          content: 'export const generated = true;\n',
          language: 'typescript',
        },
      ],
      model: params.model,
      inputTokens: 3,
      outputTokens: 5,
      durationMs: 1,
      costUsd: 0,
      finishReason: 'stop',
    };
  }

  async *streamGenerate(params: GenerateParams): AsyncIterable<ModelStreamEvent> {
    yield { type: 'text-delta', text: 'generated:' };
    yield { type: 'text-delta', text: params.messages.at(-1)?.content ?? '' };
    yield {
      type: 'done',
      result: await this.generate(params),
    };
  }
}

describe('FEATURE041 - Model Provider Types and Base Interface', () => {
  it('supports a fake provider that satisfies the interface and returns generated text/files', async () => {
    const provider: ModelProvider = new FakeProvider();

    const result = await provider.generate({
      model: 'fake-model',
      messages: [{ role: 'user', content: 'hello' }],
      maxTokens: 64,
    });

    expect(result).toMatchObject({
      text: 'generated:hello',
      model: 'fake-model',
      inputTokens: 3,
      outputTokens: 5,
      finishReason: 'stop',
    });
    expect(result.files).toEqual([
      {
        path: 'src/example.ts',
        content: 'export const generated = true;\n',
        language: 'typescript',
      },
    ]);
  });

  it('keeps streaming optional while allowing providers to expose stream events', async () => {
    const provider: ModelProvider = new FakeProvider();

    expect(provider.streamGenerate).toEqual(expect.any(Function));
    if (!provider.streamGenerate) {
      throw new Error('Expected FakeProvider to implement streamGenerate for this test.');
    }

    const events: ModelStreamEvent[] = [];
    for await (const event of provider.streamGenerate({
      model: 'fake-model',
      messages: [{ role: 'user', content: 'stream' }],
    })) {
      events.push(event);
    }

    expect(events.map(event => event.type)).toEqual(['text-delta', 'text-delta', 'done']);
    expect(events.at(-1)).toMatchObject({
      type: 'done',
      result: { text: 'generated:stream' },
    });
  });

  it('returns typed health and model metadata without vendor-specific assumptions', async () => {
    const provider: ModelProvider = new FakeProvider();

    await expect(provider.healthCheck()).resolves.toMatchObject({
      ok: true,
      status: 'healthy',
      providerId: 'fake-provider',
    });
    await expect(provider.listModels()).resolves.toEqual([
      expect.objectContaining({
        id: 'fake-model',
        provider: 'fake',
        supportsStreaming: true,
      }),
    ]);
  });

  it('rejects blank provider identity with an actionable model error', () => {
    expect(() => new BaseModelProvider({ id: '', provider: 'fake', isLocal: true })).toThrow(ModelError);
    expect(() => new BaseModelProvider({ id: 'fake', provider: '   ', isLocal: true })).toThrow(/provider/i);
  });
});
