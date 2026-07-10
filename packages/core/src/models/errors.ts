import { DevLoopError } from '../errors.js';
import { REDACTED, redactSecrets } from '../utils/redaction.js';

export type ModelErrorKind =
  | 'token-limit'
  | 'rate-limit'
  | 'invalid-key'
  | 'missing-model'
  | 'context-too-long'
  | 'timeout'
  | 'vram'
  | 'cli-missing'
  | 'network'
  | 'unknown';

export type ModelErrorResolution = 'retry' | 'switch' | 'fail';

export interface ModelErrorContext {
  providerId?: string;
  model?: string;
}

export interface ClassifiedModelError {
  kind: ModelErrorKind;
  resolution: ModelErrorResolution;
  message: string;
  action: string;
  providerId?: string;
  model?: string;
  status?: number;
  retryAfterMs?: number;
  details: Record<string, unknown>;
}

interface ErrorSnapshot {
  message: string;
  status?: number;
  code?: string;
  retryAfterMs?: number;
  raw: Record<string, unknown>;
}

const CLASSIFIERS: Array<{
  kind: ModelErrorKind;
  resolution: ModelErrorResolution;
  matches(snapshot: ErrorSnapshot): boolean;
  action: string;
}> = [
  {
    kind: 'rate-limit',
    resolution: 'retry',
    matches: snapshot => snapshot.status === 429 || contains(snapshot, /rate limit|too many requests/i),
    action: 'Retry after the provider rate limit resets, respecting retryAfterMs when present.',
  },
  {
    kind: 'invalid-key',
    resolution: 'fail',
    matches: snapshot => snapshot.status === 401 || snapshot.status === 403 || contains(snapshot, /invalid .*key|unauthorized|forbidden|authentication/i),
    action: 'Check the configured API key or credentials before retrying.',
  },
  {
    kind: 'missing-model',
    resolution: 'switch',
    matches: snapshot => snapshot.status === 404 || contains(snapshot, /model .*not found|unknown model|does not exist/i),
    action: 'Switch to an available model or update the configured model name.',
  },
  {
    kind: 'context-too-long',
    resolution: 'switch',
    matches: snapshot => contains(snapshot, /context_length_exceeded|context length|maximum context|prompt is too long/i),
    action: 'Reduce prompt context or switch to a model with a larger context window.',
  },
  {
    kind: 'token-limit',
    resolution: 'switch',
    matches: snapshot => contains(snapshot, /max[_ -]?tokens|token limit|too many tokens|maximum tokens/i),
    action: 'Lower maxTokens or switch to a model with a higher token limit.',
  },
  {
    kind: 'timeout',
    resolution: 'retry',
    matches: snapshot => contains(snapshot, /timed?\s*out|timeout|etimedout|abort/i),
    action: 'Retry the request, or increase the provider timeout if the service is healthy.',
  },
  {
    kind: 'vram',
    resolution: 'switch',
    matches: snapshot => contains(snapshot, /cuda out of memory|vram|gpu memory|out of memory/i),
    action: 'Use a smaller local model, free GPU memory, or switch to a remote provider.',
  },
  {
    kind: 'cli-missing',
    resolution: 'fail',
    matches: snapshot => snapshot.code === 'ENOENT' || contains(snapshot, /spawn .*enoent|command not found|executable not found/i),
    action: 'Install the required local model CLI or fix the configured executable path.',
  },
  {
    kind: 'network',
    resolution: 'retry',
    matches: snapshot => contains(snapshot, /econnrefused|enotfound|econnreset|network|fetch failed|socket hang up/i),
    action: 'Check provider connectivity and retry when the service is reachable.',
  },
];

export class ModelProviderError extends DevLoopError {
  readonly kind: ModelErrorKind;
  readonly resolution: ModelErrorResolution;
  readonly retryAfterMs?: number;

  constructor(classified: ClassifiedModelError) {
    super(
      classified.message,
      `model.${classified.kind}`,
      classified.action,
      {
        kind: classified.kind,
        resolution: classified.resolution,
        providerId: classified.providerId,
        model: classified.model,
        status: classified.status,
        retryAfterMs: classified.retryAfterMs,
        details: classified.details,
      },
    );
    this.name = 'ModelProviderError';
    this.kind = classified.kind;
    this.resolution = classified.resolution;
    this.retryAfterMs = classified.retryAfterMs;
  }
}

export function classifyModelError(error: unknown, context: ModelErrorContext = {}): ClassifiedModelError {
  const snapshot = toSnapshot(error);
  const classifier = CLASSIFIERS.find(candidate => candidate.matches(snapshot));
  const kind = classifier?.kind ?? 'unknown';
  const resolution = classifier?.resolution ?? 'fail';
  const action = classifier?.action ?? 'Inspect the provider error details and choose another provider if the problem persists.';

  return {
    kind,
    resolution,
    message: buildMessage(kind, snapshot.message),
    action,
    ...(context.providerId !== undefined ? { providerId: context.providerId } : {}),
    ...(context.model !== undefined ? { model: context.model } : {}),
    ...(snapshot.status !== undefined ? { status: snapshot.status } : {}),
    ...(snapshot.retryAfterMs !== undefined ? { retryAfterMs: snapshot.retryAfterMs } : {}),
    details: redactSecrets(sanitizeStrings(snapshot.raw)) as Record<string, unknown>,
  };
}

function toSnapshot(error: unknown): ErrorSnapshot {
  const raw = normalizeRaw(error);
  const message = sanitizeMessage(extractMessage(error, raw));

  return {
    message,
    raw,
    ...(numberField(raw.status) !== undefined ? { status: numberField(raw.status) } : {}),
    ...(stringField(raw.code) !== undefined ? { code: stringField(raw.code) } : {}),
    ...(extractRetryAfterMs(raw) !== undefined ? { retryAfterMs: extractRetryAfterMs(raw) } : {}),
  };
}

function normalizeRaw(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      ...(error.cause !== undefined ? { cause: error.cause } : {}),
      ...objectFields(error),
    };
  }

  if (error && typeof error === 'object') {
    return objectFields(error);
  }

  return { message: String(error) };
}

function objectFields(value: object): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const key of Object.keys(value)) {
    result[key] = (value as Record<string, unknown>)[key];
  }
  return result;
}

function extractMessage(error: unknown, raw: Record<string, unknown>): string {
  if (error instanceof Error && error.message) return error.message;
  const rawMessage = raw.message;
  if (typeof rawMessage === 'string' && rawMessage.length > 0) return rawMessage;
  if (typeof error === 'string' && error.length > 0) return error;
  return 'Unknown model provider error.';
}

function buildMessage(kind: ModelErrorKind, detail: string): string {
  return `Model provider ${kind} error: ${detail}`;
}

function contains(snapshot: ErrorSnapshot, pattern: RegExp): boolean {
  return pattern.test(`${snapshot.code ?? ''} ${snapshot.message}`);
}

function numberField(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function stringField(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function extractRetryAfterMs(raw: Record<string, unknown>): number | undefined {
  const retryAfter = headerValue(raw.headers, 'retry-after') ?? raw.retryAfter ?? raw.retry_after;
  if (typeof retryAfter === 'number' && Number.isFinite(retryAfter)) return retryAfter * 1000;
  if (typeof retryAfter !== 'string') return undefined;

  const seconds = Number(retryAfter);
  if (Number.isFinite(seconds)) return seconds * 1000;

  const dateMs = Date.parse(retryAfter);
  return Number.isFinite(dateMs) ? Math.max(0, dateMs - Date.now()) : undefined;
}

function headerValue(headers: unknown, name: string): unknown {
  if (headers instanceof Map) {
    return headers.get(name) ?? headers.get(name.toLowerCase()) ?? headers.get(name.toUpperCase());
  }

  if (!headers || typeof headers !== 'object') return undefined;

  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === name.toLowerCase()) return value;
  }

  return undefined;
}

function sanitizeMessage(message: string): string {
  return message
    .replace(/\bsk-[A-Za-z0-9_-]+\b/g, REDACTED)
    .replace(/\bBearer\s+\S+/gi, `Bearer ${REDACTED}`)
    .replace(/\b(api[-_ ]?key|token|authorization)\s*[:= ]\s*\S+/gi, `$1 ${REDACTED}`);
}

function sanitizeStrings(value: unknown): unknown {
  if (typeof value === 'string') return sanitizeMessage(value);
  if (Array.isArray(value)) return value.map(sanitizeStrings);
  if (!value || typeof value !== 'object') return value;
  if (value instanceof Date) return value;
  if (value instanceof Map) {
    return Object.fromEntries(Array.from(value.entries()).map(([key, nested]) => [String(key), sanitizeStrings(nested)]));
  }

  const result: Record<string, unknown> = {};
  for (const [key, nested] of Object.entries(value)) {
    result[key] = sanitizeStrings(nested);
  }
  return result;
}
