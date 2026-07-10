import { BaseModelProvider } from '../base.js';
import { classifyModelError, ModelProviderError } from '../errors.js';
import type {
  GenerateFinishReason,
  GenerateParams,
  GenerateResult,
  ModelInfo,
  ModelProviderId,
  ModelStreamEvent,
  ProviderHealth,
} from '../types.js';

export interface OpenAICompatibleFetchInit {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  signal?: AbortSignal;
}

export type OpenAICompatibleFetch = (input: string, init?: OpenAICompatibleFetchInit) => Promise<Response>;

export interface OpenAIProviderOptions {
  apiKey?: string;
  env?: Record<string, string | undefined>;
  fetch?: OpenAICompatibleFetch;
  baseUrl?: string;
  timeoutMs?: number;
}

interface OpenAIChatResponse {
  model?: string;
  choices?: Array<{
    message?: { content?: string };
    delta?: { content?: string };
    finish_reason?: string;
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
  };
}

interface ModelListResponse {
  data?: Array<Record<string, unknown>>;
}

const DEFAULT_OPENAI_BASE_URL = 'https://api.openai.com/v1';

export class OpenAIProvider extends BaseModelProvider {
  protected readonly apiKey: string;
  protected readonly baseUrl: string;
  protected readonly fetchImpl: OpenAICompatibleFetch;
  protected readonly timeoutMs: number;

  constructor(options: OpenAIProviderOptions = {}) {
    super({ id: 'openai', provider: 'openai', isLocal: false });
    this.apiKey = resolveApiKey({
      explicit: options.apiKey,
      env: options.env,
      envName: 'OPENAI_API_KEY',
      providerId: this.id,
    });
    this.baseUrl = (options.baseUrl ?? DEFAULT_OPENAI_BASE_URL).replace(/\/+$/, '');
    this.fetchImpl = options.fetch ?? defaultFetch;
    this.timeoutMs = options.timeoutMs ?? 30000;
  }

  async healthCheck(): Promise<ProviderHealth> {
    const started = Date.now();
    try {
      await this.listModels();
      return this.createHealthCheck({ ok: true, latencyMs: Date.now() - started });
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
    const response = await this.requestJson<ModelListResponse>('/models');
    return (response.data ?? []).map(model => this.toModelInfo(model));
  }

  async generate(params: GenerateParams): Promise<GenerateResult> {
    const started = Date.now();
    try {
      const response = await this.requestJson<OpenAIChatResponse>('/chat/completions', {
        method: 'POST',
        body: JSON.stringify(this.buildChatBody(params, false)),
      }, params.timeoutMs);
      const choice = response.choices?.[0];

      return {
        text: choice?.message?.content ?? '',
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
    let text = '';
    try {
      const response = await this.request('/chat/completions', {
        method: 'POST',
        body: JSON.stringify(this.buildChatBody(params, true)),
      }, params.timeoutMs);

      if (!isAsyncIterable(response.body)) {
        throw new Error(`${this.id} streaming response did not include a readable body.`);
      }

      for await (const event of parseOpenAISse(response.body)) {
        if (event.type === 'text-delta') text += event.text;
        yield event;
      }

      yield {
        type: 'done',
        result: {
          text,
          files: [],
          model: params.model,
          finishReason: 'stop',
        },
      };
    } catch (error) {
      throw this.toProviderError(error, params.model);
    }
  }

  protected providerForMetadata(): ModelProviderId {
    return 'openai';
  }

  protected buildChatBody(params: GenerateParams, stream: boolean): Record<string, unknown> {
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

  protected toModelInfo(model: Record<string, unknown>): ModelInfo {
    const id = typeof model.id === 'string' ? model.id : 'unknown';
    return {
      id,
      name: typeof model.name === 'string' ? model.name : id,
      provider: this.providerForMetadata(),
      isLocal: false,
      metadata: model,
    };
  }

  protected async requestJson<T>(path: string, init: OpenAICompatibleFetchInit = {}, timeoutMs?: number): Promise<T> {
    const response = await this.request(path, init, timeoutMs);
    return response.json() as Promise<T>;
  }

  protected async request(path: string, init: OpenAICompatibleFetchInit = {}, timeoutMs?: number): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs ?? this.timeoutMs);
    try {
      const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
        ...init,
        headers: {
          authorization: `Bearer ${this.apiKey}`,
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
        throw Object.assign(new Error(`${this.id} request timed out`), { code: 'ETIMEDOUT' });
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  protected toProviderError(error: unknown, model?: string): ModelProviderError {
    return new ModelProviderError(classifyModelError(error, { providerId: this.id, model }));
  }
}

export function resolveApiKey(options: {
  explicit?: string;
  env?: Record<string, string | undefined>;
  envName: string;
  providerId: string;
}): string {
  const value = options.explicit ?? options.env?.[options.envName] ?? process.env[options.envName];
  if (!value || value.trim().length === 0) {
    throw new ModelProviderError({
      kind: 'invalid-key',
      resolution: 'fail',
      message: `${options.providerId} API key is required.`,
      action: `Set ${options.envName} or pass an API key explicitly.`,
      providerId: options.providerId,
      details: { envName: options.envName },
    });
  }
  return value;
}

function defaultFetch(input: string, init?: OpenAICompatibleFetchInit): Promise<Response> {
  return fetch(input, init);
}

async function responseToError(response: Response): Promise<Record<string, unknown>> {
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    body = undefined;
  }

  const message = body && typeof body === 'object'
    ? readErrorMessage(body as Record<string, unknown>)
    : undefined;

  return {
    status: response.status,
    message: message ?? `${response.status} ${response.statusText}`,
    body,
  };
}

function readErrorMessage(body: Record<string, unknown>): string | undefined {
  const error = body.error;
  if (typeof error === 'string') return error;
  if (error && typeof error === 'object' && typeof (error as Record<string, unknown>).message === 'string') {
    return (error as Record<string, unknown>).message as string;
  }
  return undefined;
}

function normalizeFinishReason(value: unknown): GenerateFinishReason {
  if (value === 'stop' || value === 'length' || value === 'content-filter') return value;
  if (value === 'tool_calls') return 'tool-call';
  return 'unknown';
}

function isAsyncIterable(value: unknown): value is AsyncIterable<Uint8Array | string> {
  return Boolean(value && typeof value === 'object' && Symbol.asyncIterator in value);
}

async function* parseOpenAISse(body: AsyncIterable<Uint8Array | string>): AsyncIterable<ModelStreamEvent> {
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
      const parsed = JSON.parse(data) as OpenAIChatResponse;
      const text = parsed.choices?.[0]?.delta?.content;
      if (typeof text === 'string' && text.length > 0) {
        yield { type: 'text-delta', text };
      }
    }
  }
}
