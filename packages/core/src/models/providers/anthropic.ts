import { BaseModelProvider } from '../base.js';
import { classifyModelError, ModelProviderError } from '../errors.js';
import type { GenerateParams, GenerateResult, ModelInfo, ProviderHealth } from '../types.js';
import { resolveApiKey } from './openai.js';

export interface AnthropicMessageCreateInput {
  model: string;
  max_tokens?: number;
  messages: Array<{ role: string; content: string }>;
  thinking?: { type: 'enabled'; budget_tokens: number };
}

export interface AnthropicMessageResponse {
  model?: string;
  content?: Array<{ type?: string; text?: string }>;
  usage?: { input_tokens?: number; output_tokens?: number };
  stop_reason?: string;
}

export interface AnthropicClientLike {
  messages: {
    create(input: AnthropicMessageCreateInput): Promise<AnthropicMessageResponse>;
  };
}

export interface AnthropicProviderOptions {
  apiKey?: string;
  env?: Record<string, string | undefined>;
  client?: AnthropicClientLike;
  extendedThinking?: boolean;
  thinkingBudgetTokens?: number;
}

export class AnthropicProvider extends BaseModelProvider {
  private readonly apiKey: string;
  private readonly client: AnthropicClientLike;
  private readonly extendedThinking: boolean;
  private readonly thinkingBudgetTokens: number;

  constructor(options: AnthropicProviderOptions = {}) {
    super({ id: 'anthropic', provider: 'anthropic', isLocal: false });
    this.apiKey = resolveApiKey({
      explicit: options.apiKey,
      env: options.env,
      envName: 'ANTHROPIC_API_KEY',
      providerId: this.id,
    });
    this.client = options.client ?? createMissingAnthropicClient();
    this.extendedThinking = options.extendedThinking ?? false;
    this.thinkingBudgetTokens = options.thinkingBudgetTokens ?? 1024;
  }

  async healthCheck(): Promise<ProviderHealth> {
    return this.createHealthCheck({ ok: this.apiKey.length > 0 });
  }

  async listModels(): Promise<ModelInfo[]> {
    return [];
  }

  async generate(params: GenerateParams): Promise<GenerateResult> {
    const started = Date.now();
    try {
      const input: AnthropicMessageCreateInput = {
        model: params.model,
        ...(params.maxTokens !== undefined ? { max_tokens: params.maxTokens } : {}),
        messages: params.messages.map(message => ({ role: message.role, content: message.content })),
        ...(this.shouldUseExtendedThinking(params.model)
          ? { thinking: { type: 'enabled', budget_tokens: this.thinkingBudgetTokens } as const }
          : {}),
      };
      const response = await this.client.messages.create(input);
      const inputTokens = response.usage?.input_tokens;
      const outputTokens = response.usage?.output_tokens;

      return {
        text: extractAnthropicText(response),
        files: [],
        model: response.model ?? params.model,
        ...(inputTokens !== undefined ? { inputTokens } : {}),
        ...(outputTokens !== undefined ? { outputTokens } : {}),
        durationMs: Date.now() - started,
        costUsd: estimateProviderCostUsd('anthropic', params.model, inputTokens, outputTokens),
        finishReason: response.stop_reason === 'max_tokens' ? 'length' : 'stop',
        raw: response,
      };
    } catch (error) {
      throw new ModelProviderError(classifyModelError(error, { providerId: this.id, model: params.model }));
    }
  }

  private shouldUseExtendedThinking(model: string): boolean {
    return this.extendedThinking && /claude-(3-7|4|sonnet-4)/i.test(model);
  }
}

export function estimateProviderCostUsd(
  provider: 'anthropic' | 'google',
  model: string,
  inputTokens = 0,
  outputTokens = 0,
): number {
  const pricing = provider === 'anthropic'
    ? anthropicPricing(model)
    : googlePricing(model);
  return (inputTokens / 1_000_000) * pricing.inputPer1M + (outputTokens / 1_000_000) * pricing.outputPer1M;
}

function extractAnthropicText(response: AnthropicMessageResponse): string {
  return (response.content ?? [])
    .filter(block => block.type === 'text' || block.type === undefined)
    .map(block => block.text ?? '')
    .join('');
}

function anthropicPricing(model: string): { inputPer1M: number; outputPer1M: number } {
  if (/haiku/i.test(model)) return { inputPer1M: 0.25, outputPer1M: 1.25 };
  if (/opus/i.test(model)) return { inputPer1M: 15, outputPer1M: 75 };
  return { inputPer1M: 3, outputPer1M: 15 };
}

function googlePricing(model: string): { inputPer1M: number; outputPer1M: number } {
  if (/flash/i.test(model)) return { inputPer1M: 0.075, outputPer1M: 0.3 };
  return { inputPer1M: 1.25, outputPer1M: 5 };
}

function createMissingAnthropicClient(): AnthropicClientLike {
  return {
    messages: {
      create: async () => {
        throw new Error('Anthropic client is not configured.');
      },
    },
  };
}
