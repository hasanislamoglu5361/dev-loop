import { describe, expect, it } from 'vitest';
import { AutoModelSelector, ModelSelectionError, type SelectorCandidate } from '../../models/selector.js';

const localFast: SelectorCandidate = {
  id: 'local-fast',
  name: 'Local Fast',
  provider: 'lmstudio',
  providerId: 'lmstudio',
  isLocal: true,
  estimatedVramMb: 4096,
  tokensPerSecond: 60,
};

const localHuge: SelectorCandidate = {
  id: 'local-huge',
  name: 'Local Huge',
  provider: 'ollama',
  providerId: 'ollama',
  isLocal: true,
  estimatedVramMb: 64000,
  tokensPerSecond: 100,
};

const cloudCheap: SelectorCandidate = {
  id: 'openrouter/cheap-code',
  name: 'Cheap Code',
  provider: 'openrouter',
  providerId: 'openrouter',
  contextWindow: 64000,
  inputCostPer1M: 0.1,
  outputCostPer1M: 0.2,
};

const cloudExpensive: SelectorCandidate = {
  id: 'openai/expensive-code',
  name: 'Expensive Code',
  provider: 'openrouter',
  providerId: 'openrouter',
  contextWindow: 128000,
  inputCostPer1M: 2,
  outputCostPer1M: 6,
};

function selectorWith(candidates: SelectorCandidate[], overrides: Partial<ConstructorParameters<typeof AutoModelSelector>[0]> = {}): AutoModelSelector {
  return new AutoModelSelector({
    registry: { listModels: async () => candidates },
    vram: { detect: async () => ({ totalMb: 8192, availableMb: 8192, source: 'fallback', reliable: false }) },
    history: { getBestModel: async () => null, countRecentFailures: async () => 0 },
    ...overrides,
  });
}

describe('FEATURE050 - Auto Model Selector', () => {
  it('uses task override before local, history, or cheapest cloud branches', async () => {
    const selector = selectorWith([localFast, cloudCheap]);

    await expect(selector.selectModel({
      taskOverride: { providerId: 'openrouter', modelId: 'openrouter/cheap-code' },
      preferLocal: true,
    })).resolves.toMatchObject({ providerId: 'openrouter', modelId: 'openrouter/cheap-code', reason: 'task-override' });
  });

  it('prefers local models only when configured and VRAM fits', async () => {
    const selector = selectorWith([localFast, localHuge, cloudCheap]);

    await expect(selector.selectModel({ preferLocal: true })).resolves.toMatchObject({
      providerId: 'lmstudio',
      modelId: 'local-fast',
      reason: 'local-vram',
    });
  });

  it('uses historical success rate when local preference is disabled', async () => {
    const selector = selectorWith([cloudCheap, cloudExpensive], {
      history: {
        getBestModel: async () => ({ providerId: 'openrouter', modelId: 'openai/expensive-code', successRate: 0.9 }),
        countRecentFailures: async () => 0,
      },
    });

    await expect(selector.selectModel({ preferLocal: false, featureType: 'api', language: 'ts' })).resolves.toMatchObject({
      modelId: 'openai/expensive-code',
      reason: 'history',
    });
  });

  it('falls back to the cheapest capable cloud model and excludes failed models', async () => {
    const selector = selectorWith([localHuge, cloudCheap, cloudExpensive], {
      vram: { detect: async () => ({ totalMb: 2048, availableMb: 2048, source: 'fallback', reliable: false }) },
    });

    await expect(selector.selectModel({
      preferLocal: true,
      failedModelIds: ['openrouter/cheap-code'],
      minContextWindow: 32000,
    })).resolves.toMatchObject({
      modelId: 'openai/expensive-code',
      reason: 'cheapest-cloud',
    });
  });

  it('handles repeated failures by switching models with confirmation', async () => {
    const selector = selectorWith([cloudCheap, cloudExpensive], {
      history: {
        getBestModel: async () => null,
        countRecentFailures: async () => 2,
      },
      confirmSwitch: async () => true,
    });

    await expect(selector.handleRepeatedFailure({
      current: { providerId: 'openrouter', modelId: 'openrouter/cheap-code' },
      failureThreshold: 2,
      autoConfirmSwitch: false,
    })).resolves.toMatchObject({
      modelId: 'openai/expensive-code',
      switched: true,
    });
  });

  it('keeps the current model when confirmation is required and declined', async () => {
    const selector = selectorWith([cloudCheap, cloudExpensive], {
      history: {
        getBestModel: async () => null,
        countRecentFailures: async () => 2,
      },
      confirmSwitch: async () => false,
    });

    await expect(selector.handleRepeatedFailure({
      current: { providerId: 'openrouter', modelId: 'openrouter/cheap-code' },
      failureThreshold: 2,
      autoConfirmSwitch: false,
    })).resolves.toMatchObject({
      modelId: 'openrouter/cheap-code',
      switched: false,
    });
  });

  it('throws an actionable error when no candidate can be selected', async () => {
    const selector = selectorWith([]);

    await expect(selector.selectModel()).rejects.toBeInstanceOf(ModelSelectionError);
    await expect(selector.selectModel()).rejects.toMatchObject({
      code: 'model.selection',
      action: expect.stringContaining('Register'),
    });
  });
});
