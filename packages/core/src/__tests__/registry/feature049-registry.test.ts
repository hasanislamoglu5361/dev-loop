import { describe, expect, it } from 'vitest';
import { ModelRegistry, ModelRegistryError } from '../../models/registry.js';
import type { GenerateParams, GenerateResult, ModelInfo, ModelProvider, ProviderHealth } from '../../models/types.js';

class FakeRegistryProvider implements ModelProvider {
  readonly isLocal = false;

  constructor(
    readonly id: string,
    readonly provider: string,
    private readonly models: ModelInfo[],
    private readonly healthy = true,
  ) {}

  async listModels(): Promise<ModelInfo[]> {
    return this.models;
  }

  async healthCheck(): Promise<ProviderHealth> {
    return {
      ok: this.healthy,
      status: this.healthy ? 'healthy' : 'unavailable',
      providerId: this.id,
      checkedAt: new Date(),
    };
  }

  async generate(params: GenerateParams): Promise<GenerateResult> {
    return { text: params.model, files: [], model: params.model };
  }
}

describe('FEATURE049 - Model Registry', () => {
  it('registers providers and lists them without using a global-only registry', () => {
    const first = new ModelRegistry();
    const second = new ModelRegistry();

    first.register(new FakeRegistryProvider('fake-a', 'fake', []));

    expect(first.listProviders().map(provider => provider.id)).toEqual(['fake-a']);
    expect(second.listProviders()).toEqual([]);
  });

  it('prevents duplicate provider registration', () => {
    const registry = new ModelRegistry();
    registry.register(new FakeRegistryProvider('fake', 'fake', []));

    expect(() => registry.register(new FakeRegistryProvider('fake', 'fake', []))).toThrow(ModelRegistryError);
    expect(() => registry.register(new FakeRegistryProvider('fake', 'fake', []))).toThrow(/already registered/i);
  });

  it('resolves provider/model ids and lists all available models', async () => {
    const registry = new ModelRegistry();
    const provider = new FakeRegistryProvider('fake', 'fake', [
      { id: 'model-a', name: 'Model A', provider: 'fake' },
      { id: 'model-b', name: 'Model B', provider: 'fake' },
    ]);
    registry.register(provider);

    await expect(registry.listModels()).resolves.toEqual([
      expect.objectContaining({ id: 'model-a', providerId: 'fake' }),
      expect.objectContaining({ id: 'model-b', providerId: 'fake' }),
    ]);
    await expect(registry.resolve('fake/model-b')).resolves.toMatchObject({
      provider,
      model: expect.objectContaining({ id: 'model-b' }),
      modelId: 'model-b',
    });
  });

  it('returns actionable errors for missing providers and models', async () => {
    const registry = new ModelRegistry();
    registry.register(new FakeRegistryProvider('fake', 'fake', [{ id: 'model-a', name: 'Model A', provider: 'fake' }]));

    await expect(registry.resolve('missing/model-a')).rejects.toMatchObject({
      code: 'model.registry',
      action: expect.stringContaining('Register provider'),
    });
    await expect(registry.resolve('fake/missing-model')).rejects.toMatchObject({
      code: 'model.registry',
      action: expect.stringContaining('available models'),
    });
  });

  it('health-checks registered providers only when requested', async () => {
    const registry = new ModelRegistry();
    registry.register(new FakeRegistryProvider('healthy', 'fake', [], true));
    registry.register(new FakeRegistryProvider('down', 'fake', [], false));

    await expect(registry.healthCheck()).resolves.toEqual({
      healthy: expect.objectContaining({ ok: true, providerId: 'healthy' }),
      down: expect.objectContaining({ ok: false, providerId: 'down' }),
    });
  });
});
