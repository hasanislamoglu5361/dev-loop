import { OpenAIProvider, type OpenAIProviderOptions } from './openai.js';
import type { ModelInfo, ModelProviderId } from '../types.js';

export interface OpenRouterProviderOptions extends OpenAIProviderOptions {}

export interface OpenRouterModel {
  id: string;
  contextWindow: number;
  promptPrice: number;
  completionPrice: number;
}

export interface OpenRouterModelFilter {
  minContextWindow?: number;
}

const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';

export class OpenRouterProvider extends OpenAIProvider {
  constructor(options: OpenRouterProviderOptions = {}) {
    super({
      ...options,
      env: options.env,
      apiKey: options.apiKey ?? options.env?.OPENROUTER_API_KEY,
      baseUrl: options.baseUrl ?? OPENROUTER_BASE_URL,
    });
    Object.defineProperty(this, 'id', { value: 'openrouter' });
    Object.defineProperty(this, 'provider', { value: 'openrouter' });
  }

  protected override providerForMetadata(): ModelProviderId {
    return 'openrouter';
  }

  protected override toModelInfo(model: Record<string, unknown>): ModelInfo {
    const info = super.toModelInfo(model);
    const contextWindow = numericField(model.context_length) ?? numericField(model.contextWindow);
    const pricing = model.pricing && typeof model.pricing === 'object'
      ? model.pricing as Record<string, unknown>
      : {};
    const promptPrice = pricePerMillion(pricing.prompt);
    const completionPrice = pricePerMillion(pricing.completion);

    return {
      ...info,
      ...(contextWindow !== undefined ? { contextWindow } : {}),
      ...(promptPrice !== undefined ? { inputCostPer1M: promptPrice } : {}),
      ...(completionPrice !== undefined ? { outputCostPer1M: completionPrice } : {}),
    };
  }
}

export function selectCheapestOpenRouterModel(
  models: OpenRouterModel[],
  filter: OpenRouterModelFilter = {},
): OpenRouterModel | null {
  const capable = models.filter(model => model.contextWindow >= (filter.minContextWindow ?? 0));
  capable.sort((left, right) => totalPrice(left) - totalPrice(right));
  return capable[0] ?? null;
}

function totalPrice(model: OpenRouterModel): number {
  return model.promptPrice + model.completionPrice;
}

function numericField(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function pricePerMillion(value: unknown): number | undefined {
  const price = typeof value === 'string' ? Number(value) : value;
  return typeof price === 'number' && Number.isFinite(price) ? price * 1_000_000 : undefined;
}
