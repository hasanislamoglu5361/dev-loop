import { BaseModelProvider } from './base.js';
import { classifyModelError, ModelProviderError } from './errors.js';
import type {
  GenerateParams,
  GenerateResult,
  ModelInfo,
  ProviderHealth,
} from './types.js';

export interface OllamaFetchInit {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  signal?: AbortSignal;
}

export type OllamaFetchLike = (input: string, init?: OllamaFetchInit) => Promise<Response>;

export interface OllamaProviderOptions {
  baseUrl?: string;
  fetch?: OllamaFetchLike;
  timeoutMs?: number;
  onMissingModel?: (model: string) => Promise<void> | void;
}

interface OllamaTagsResponse {
  models?: Array<Record<string, unknown>>;
}

interface OllamaChatResponse {
  model?: string;
  message?: {
    role?: string;
    content?: string;
  };
  response?: string;
  done?: boolean;
  prompt_eval_count?: number;
  eval_count?: number;
  error?: string;
}

const DEFAULT_BASE_URL = 'http://localhost:11434';

export class OllamaProvider extends BaseModelProvider {
  private readonly baseUrl: string;
  private readonly fetchImpl: OllamaFetchLike;
  private readonly timeoutMs: number;
  private readonly onMissingModel?: (model: string) => Promise<void> | void;

  constructor(options: OllamaProviderOptions = {}) {
    super({ id: 'ollama', provider: 'ollama', isLocal: true });
    this.baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, '');
    this.fetchImpl = options.fetch ?? defaultFetch;
    this.timeoutMs = options.timeoutMs ?? 30000;
    this.onMissingModel = options.onMissingModel;
  }

  async healthCheck(): Promise<ProviderHealth> {
    const started = Date.now();
    try {
      const models = await this.listModels();
      return this.createHealthCheck({
        ok: true,
        latencyMs: Date.now() - started,
        details: { modelCount: models.length },
      });
    } catch (error) {
      const classified = classifyModelError(error, { providerId: this.id });
      return this.createHealthCheck({
        ok: false,
        status: 'unavailable',
        latencyMs: Date.now() - started,
        message: `${classified.kind}: ${classified.action}`,
        details: classified.details,
      });
    }
  }

  async listModels(): Promise<ModelInfo[]> {
    const response = await this.requestJson<OllamaTagsResponse>('/api/tags');
    return (response.models ?? []).map(toModelInfo);
  }

  async generate(params: GenerateParams): Promise<GenerateResult> {
    const started = Date.now();
    try {
      const response = await this.requestJson<OllamaChatResponse>('/api/chat', {
        method: 'POST',
        body: JSON.stringify({
          model: params.model,
          messages: params.messages.map(message => ({
            role: message.role,
            content: message.content,
          })),
          stream: false,
        }),
      }, params.timeoutMs);

      return {
        text: response.message?.content ?? response.response ?? '',
        files: [],
        model: response.model ?? params.model,
        ...(response.prompt_eval_count !== undefined ? { inputTokens: response.prompt_eval_count } : {}),
        ...(response.eval_count !== undefined ? { outputTokens: response.eval_count } : {}),
        durationMs: Date.now() - started,
        finishReason: response.done === false ? 'unknown' : 'stop',
        raw: response,
      };
    } catch (error) {
      const providerError = this.toProviderError(error, params.model);
      if (providerError.kind === 'missing-model' && this.onMissingModel) {
        await this.onMissingModel(params.model);
        throw new ModelProviderError({
          ...classifyModelError(error, { providerId: this.id, model: params.model }),
          action: `Run ollama pull ${params.model} or configure a different available model.`,
        });
      }
      throw providerError;
    }
  }

  private async requestJson<T>(path: string, init: OllamaFetchInit = {}, timeoutMs?: number): Promise<T> {
    const response = await this.request(path, init, timeoutMs);
    const body = await response.json() as T;
    return body;
  }

  private async request(path: string, init: OllamaFetchInit = {}, timeoutMs?: number): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs ?? this.timeoutMs);
    try {
      const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
        ...init,
        headers: {
          'content-type': 'application/json',
          ...(init.headers ?? {}),
        },
        signal: init.signal ?? controller.signal,
      });

      if (!response.ok) {
        throw await responseToError(response);
      }

      return response;
    } catch (error) {
      if (controller.signal.aborted) {
        throw Object.assign(new Error('Ollama request timed out'), { code: 'ETIMEDOUT' });
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  private toProviderError(error: unknown, model?: string): ModelProviderError {
    return new ModelProviderError(classifyModelError(error, { providerId: this.id, model }));
  }
}

function defaultFetch(input: string, init?: OllamaFetchInit): Promise<Response> {
  return fetch(input, init);
}

function toModelInfo(model: Record<string, unknown>): ModelInfo {
  const id = stringField(model.model) ?? stringField(model.name) ?? 'unknown';
  return {
    id,
    name: stringField(model.name) ?? id,
    provider: 'ollama',
    isLocal: true,
    supportsStreaming: true,
    metadata: model,
  };
}

async function responseToError(response: Response): Promise<Record<string, unknown>> {
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    body = undefined;
  }

  const errorMessage = body && typeof body === 'object'
    ? stringField((body as Record<string, unknown>).error)
    : undefined;

  return {
    status: response.status,
    message: errorMessage ?? `${response.status} ${response.statusText}`,
    body,
  };
}

function stringField(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}
