import { BaseModelProvider } from '../base.js';
import { classifyModelError, ModelProviderError } from '../errors.js';
import type { GenerateParams, GenerateResult, ModelInfo, ProviderHealth } from '../types.js';
import { estimateProviderCostUsd } from './anthropic.js';
import { resolveApiKey } from './openai.js';

export interface GoogleGenerateContentInput {
  model: string;
  contents: Array<{ role: string; parts: Array<{ text: string }> }>;
  generationConfig?: { maxOutputTokens?: number; temperature?: number };
}

export interface GoogleGenerateContentResponse {
  response?: {
    candidates?: Array<{
      content?: { parts?: Array<{ text?: string }> };
      finishReason?: string;
    }>;
    usageMetadata?: {
      promptTokenCount?: number;
      candidatesTokenCount?: number;
    };
  };
}

export interface GoogleClientLike {
  generateContent(input: GoogleGenerateContentInput): Promise<GoogleGenerateContentResponse>;
}

export interface GoogleProviderOptions {
  apiKey?: string;
  env?: Record<string, string | undefined>;
  client?: GoogleClientLike;
}

export class GoogleProvider extends BaseModelProvider {
  private readonly apiKey: string;
  private readonly client: GoogleClientLike;

  constructor(options: GoogleProviderOptions = {}) {
    super({ id: 'google', provider: 'google', isLocal: false });
    this.apiKey = resolveApiKey({
      explicit: options.apiKey,
      env: options.env,
      envName: 'GOOGLE_API_KEY',
      providerId: this.id,
    });
    this.client = options.client ?? createMissingGoogleClient();
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
      const response = await this.client.generateContent({
        model: params.model,
        contents: params.messages.map(message => ({
          role: message.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: message.content }],
        })),
        generationConfig: {
          ...(params.maxTokens !== undefined ? { maxOutputTokens: params.maxTokens } : {}),
          ...(params.temperature !== undefined ? { temperature: params.temperature } : {}),
        },
      });
      const candidate = response.response?.candidates?.[0];
      const usage = response.response?.usageMetadata;
      const inputTokens = usage?.promptTokenCount;
      const outputTokens = usage?.candidatesTokenCount;

      return {
        text: (candidate?.content?.parts ?? []).map(part => part.text ?? '').join(''),
        files: [],
        model: params.model,
        ...(inputTokens !== undefined ? { inputTokens } : {}),
        ...(outputTokens !== undefined ? { outputTokens } : {}),
        durationMs: Date.now() - started,
        costUsd: estimateProviderCostUsd('google', params.model, inputTokens, outputTokens),
        finishReason: normalizeGoogleFinishReason(candidate?.finishReason),
        raw: response,
      };
    } catch (error) {
      throw new ModelProviderError(classifyModelError(error, { providerId: this.id, model: params.model }));
    }
  }
}

function normalizeGoogleFinishReason(value: unknown): 'stop' | 'length' | 'unknown' {
  if (value === 'STOP') return 'stop';
  if (value === 'MAX_TOKENS') return 'length';
  return 'unknown';
}

function createMissingGoogleClient(): GoogleClientLike {
  return {
    generateContent: async () => {
      throw new Error('Google client is not configured.');
    },
  };
}
