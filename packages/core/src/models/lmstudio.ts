import { BaseModelProvider } from './base.js';
import { classifyModelError, ModelProviderError } from './errors.js';
import type {
  GenerateFinishReason,
  GenerateParams,
  GenerateResult,
  ModelInfo,
  ModelStreamEvent,
  ProviderHealth,
} from './types.js';

export interface FetchInit {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  signal?: AbortSignal;
}

export type FetchLike = (input: string, init?: FetchInit) => Promise<Response>;

export interface LMStudioProviderOptions {
  baseUrl?: string;
  fetch?: FetchLike;
  timeoutMs?: number;
}

export interface LMStudioSessionState {
  warm: boolean;
  lastHealthOk?: boolean;
  lastModelCount?: number;
  lastModel?: string;
  lastRequestAt?: Date;
  lastErrorKind?: string;
}

interface LMStudioModelResponse {
  data?: Array<Record<string, unknown>>;
}

interface LMStudioChatResponse {
  model?: string;
  choices?: Array<{
    message?: { content?: string };
    finish_reason?: string;
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
  };
}

const DEFAULT_BASE_URL = 'http://localhost:1234';

export class LMStudioProvider extends BaseModelProvider {
  private readonly baseUrl: string;
  private readonly fetchImpl: FetchLike;
  private readonly defaultTimeoutMs: number;
  private readonly sessionState: LMStudioSessionState = { warm: false };

  constructor(options: LMStudioProviderOptions = {}) {
    super({ id: 'lmstudio', provider: 'lmstudio', isLocal: true });
    this.baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, '');
    this.fetchImpl = options.fetch ?? defaultFetch;
    this.defaultTimeoutMs = options.timeoutMs ?? 30000;
  }

  getSessionState(): LMStudioSessionState {
    return { ...this.sessionState };
  }

  async healthCheck(): Promise<ProviderHealth> {
    const started = Date.now();
    try {
      const models = await this.fetchModels();
      this.markHealthy(models.length);
      return this.createHealthCheck({
        ok: true,
        latencyMs: Date.now() - started,
        details: { modelCount: models.length },
      });
    } catch (error) {
      const classified = classifyModelError(error, { providerId: this.id });
      this.sessionState.warm = false;
      this.sessionState.lastHealthOk = false;
      this.sessionState.lastErrorKind = classified.kind;
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
    const models = await this.fetchModels();
    this.markHealthy(models.length);
    return models;
  }

  async generate(params: GenerateParams): Promise<GenerateResult> {
    const started = Date.now();
    try {
      const response = await this.requestJson<LMStudioChatResponse>('/v1/chat/completions', {
        method: 'POST',
        body: JSON.stringify(buildChatBody(params, false)),
      }, params.timeoutMs);
      const choice = response.choices?.[0];
      const text = choice?.message?.content ?? '';
      this.markGenerated(params.model);

      return {
        text,
        files: [],
        model: response.model ?? params.model,
        ...(response.usage?.prompt_tokens !== undefined ? { inputTokens: response.usage.prompt_tokens } : {}),
        ...(response.usage?.completion_tokens !== undefined ? { outputTokens: response.usage.completion_tokens } : {}),
        durationMs: Date.now() - started,
        finishReason: normalizeFinishReason(choice?.finish_reason),
        raw: response,
      };
    } catch (error) {
      throw this.toProviderError(error, params.model);
    }
  }

  async *streamGenerate(params: GenerateParams): AsyncIterable<ModelStreamEvent> {
    const started = Date.now();
    let text = '';
    try {
      const response = await this.request('/v1/chat/completions', {
        method: 'POST',
        body: JSON.stringify(buildChatBody(params, true)),
      }, params.timeoutMs);

      if (!isAsyncIterable(response.body)) {
        throw new Error('LM Studio streaming response did not include a readable body.');
      }

      for await (const event of parseSseEvents(response.body)) {
        if (event.type === 'text-delta') text += event.text;
        yield event;
      }

      this.markGenerated(params.model);
      yield {
        type: 'done',
        result: {
          text,
          files: [],
          model: params.model,
          durationMs: Date.now() - started,
          finishReason: 'stop',
        },
      };
    } catch (error) {
      throw this.toProviderError(error, params.model);
    }
  }

  private async fetchModels(): Promise<ModelInfo[]> {
    const response = await this.requestJson<LMStudioModelResponse>('/v1/models');
    return (response.data ?? []).map(model => toModelInfo(model));
  }

  private async requestJson<T>(path: string, init: FetchInit = {}, timeoutMs?: number): Promise<T> {
    const response = await this.request(path, init, timeoutMs);
    return response.json() as Promise<T>;
  }

  private async request(path: string, init: FetchInit = {}, timeoutMs?: number): Promise<Response> {
    this.sessionState.lastRequestAt = new Date();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs ?? this.defaultTimeoutMs);
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
        throw {
          status: response.status,
          message: `${response.status} ${response.statusText}`,
        };
      }
      return response;
    } catch (error) {
      if (controller.signal.aborted) {
        throw Object.assign(new Error('LM Studio request timed out'), { code: 'ETIMEDOUT' });
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  private toProviderError(error: unknown, model?: string): ModelProviderError {
    const classified = classifyModelError(error, { providerId: this.id, model });
    this.sessionState.lastErrorKind = classified.kind;
    return new ModelProviderError(classified);
  }

  private markHealthy(modelCount: number): void {
    this.sessionState.warm = true;
    this.sessionState.lastHealthOk = true;
    this.sessionState.lastModelCount = modelCount;
  }

  private markGenerated(model: string): void {
    this.sessionState.warm = true;
    this.sessionState.lastModel = model;
  }
}

function defaultFetch(input: string, init?: FetchInit): Promise<Response> {
  return fetch(input, init);
}

function buildChatBody(params: GenerateParams, stream: boolean): Record<string, unknown> {
  return {
    model: params.model,
    messages: params.messages.map(message => ({
      role: message.role,
      content: message.content,
      ...(message.name !== undefined ? { name: message.name } : {}),
    })),
    ...(params.temperature !== undefined ? { temperature: params.temperature } : {}),
    ...(params.maxTokens !== undefined ? { max_tokens: params.maxTokens } : {}),
    stream,
  };
}

function toModelInfo(model: Record<string, unknown>): ModelInfo {
  const id = typeof model.id === 'string' ? model.id : 'unknown';
  const contextWindow = numericField(model.context_length) ?? numericField(model.max_context_length);

  return {
    id,
    name: typeof model.name === 'string' ? model.name : id,
    provider: 'lmstudio',
    isLocal: true,
    supportsStreaming: true,
    ...(contextWindow !== undefined ? { contextWindow } : {}),
    metadata: model,
  };
}

function numericField(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function normalizeFinishReason(value: unknown): GenerateFinishReason {
  if (value === 'stop' || value === 'length' || value === 'content-filter') return value;
  if (value === 'tool_calls') return 'tool-call';
  return value === undefined ? 'unknown' : 'unknown';
}

function isAsyncIterable(value: unknown): value is AsyncIterable<Uint8Array | string> {
  return Boolean(value && typeof value === 'object' && Symbol.asyncIterator in value);
}

async function* parseSseEvents(body: AsyncIterable<Uint8Array | string>): AsyncIterable<ModelStreamEvent> {
  const decoder = new TextDecoder();
  let buffer = '';

  for await (const chunk of body) {
    buffer += typeof chunk === 'string' ? chunk : decoder.decode(chunk, { stream: true });
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data:')) continue;

      const data = trimmed.slice('data:'.length).trim();
      if (data === '[DONE]') return;

      const parsed = JSON.parse(data) as { choices?: Array<{ delta?: { content?: string } }> };
      const text = parsed.choices?.[0]?.delta?.content;
      if (typeof text === 'string' && text.length > 0) {
        yield { type: 'text-delta', text };
      }
    }
  }
}
