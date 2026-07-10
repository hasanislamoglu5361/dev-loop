import { DevLoopError } from '../errors.js';
import type { ModelInfo, ModelProvider, ProviderHealth } from './types.js';

export interface RegisteredModel extends ModelInfo {
  providerId: string;
}

export interface ResolvedModel {
  provider: ModelProvider;
  model: ModelInfo;
  providerId: string;
  modelId: string;
}

export class ModelRegistryError extends DevLoopError {
  constructor(message: string, action: string, details?: Record<string, unknown>) {
    super(message, 'model.registry', action, details);
    this.name = 'ModelRegistryError';
  }
}

export class ModelRegistry {
  private readonly providers = new Map<string, ModelProvider>();

  register(provider: ModelProvider): void {
    if (this.providers.has(provider.id)) {
      throw new ModelRegistryError(
        `Model provider ${provider.id} is already registered.`,
        'Use a unique provider id or replace the provider explicitly before registering it again.',
        { providerId: provider.id },
      );
    }

    this.providers.set(provider.id, provider);
  }

  getProvider(providerId: string): ModelProvider {
    const provider = this.providers.get(providerId);
    if (!provider) {
      throw new ModelRegistryError(
        `Model provider ${providerId} is not registered.`,
        'Register provider before resolving or generating with its models.',
        { providerId, registeredProviders: Array.from(this.providers.keys()) },
      );
    }
    return provider;
  }

  listProviders(): ModelProvider[] {
    return Array.from(this.providers.values());
  }

  async listModels(): Promise<RegisteredModel[]> {
    const result: RegisteredModel[] = [];
    for (const provider of this.providers.values()) {
      const models = await provider.listModels();
      for (const model of models) {
        result.push({ ...model, providerId: provider.id });
      }
    }
    return result;
  }

  async resolve(ref: string): Promise<ResolvedModel> {
    const [providerId, modelId] = parseModelRef(ref);
    const provider = this.getProvider(providerId);
    const models = await provider.listModels();
    const model = models.find(candidate => candidate.id === modelId);
    if (!model) {
      throw new ModelRegistryError(
        `Model ${modelId} is not available from provider ${providerId}.`,
        'Check the available models for this provider and choose one of those model ids.',
        {
          providerId,
          modelId,
          availableModels: models.map(candidate => candidate.id),
        },
      );
    }

    return { provider, model, providerId, modelId };
  }

  async healthCheck(): Promise<Record<string, ProviderHealth>> {
    const result: Record<string, ProviderHealth> = {};
    for (const provider of this.providers.values()) {
      result[provider.id] = await provider.healthCheck();
    }
    return result;
  }
}

function parseModelRef(ref: string): [string, string] {
  const separator = ref.indexOf('/');
  if (separator <= 0 || separator === ref.length - 1) {
    throw new ModelRegistryError(
      `Model reference ${ref} must be in provider/model form.`,
      'Pass a model reference like "openai/gpt-4o-mini" or "ollama/llama3.2".',
      { ref },
    );
  }

  return [ref.slice(0, separator), ref.slice(separator + 1)];
}
