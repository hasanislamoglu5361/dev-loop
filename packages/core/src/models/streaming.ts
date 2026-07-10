import { DevLoopError } from '../errors.js';
import type { GenerateResult, ModelGeneratedFile, ModelStreamEvent } from './types.js';

export interface ConsumeModelStreamOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
}

export interface ConsumedModelStream {
  text: string;
  events: ModelStreamEvent[];
  startedAt: Date;
  endedAt: Date;
  durationMs: number;
  completed: boolean;
  cancelled: boolean;
  timedOut: boolean;
}

type StreamControlResult = 'cancelled' | 'timeout';

export class ModelStreamError extends DevLoopError {
  readonly partialText: string;
  readonly events: ModelStreamEvent[];

  constructor(message: string, partialText: string, events: ModelStreamEvent[], cause?: Error) {
    super(
      message,
      'model.stream',
      'Retry the stream or fall back to non-streaming generation if the provider keeps failing.',
      { partialText, eventCount: events.length },
      cause,
    );
    this.name = 'ModelStreamError';
    this.partialText = partialText;
    this.events = events;
  }
}

export function normalizeStreamEvent(chunk: unknown): ModelStreamEvent | null {
  if (typeof chunk === 'string') {
    return { type: 'text-delta', text: chunk };
  }

  if (!chunk || typeof chunk !== 'object') {
    return null;
  }

  const record = chunk as Record<string, unknown>;
  const explicit = normalizeExplicitEvent(record);
  if (explicit) return explicit;

  const openAiText = readPath(record, ['choices', 0, 'delta', 'content']);
  if (typeof openAiText === 'string') {
    return { type: 'text-delta', text: openAiText };
  }

  const anthropicText = readPath(record, ['delta', 'text']);
  if (record.type === 'content_block_delta' && typeof anthropicText === 'string') {
    return { type: 'text-delta', text: anthropicText };
  }

  const localMessageText = readPath(record, ['message', 'content']);
  if (typeof localMessageText === 'string') {
    return { type: 'text-delta', text: localMessageText };
  }

  const responseText = record.response;
  if (typeof responseText === 'string') {
    return { type: 'text-delta', text: responseText };
  }

  return null;
}

export async function consumeModelStream(
  stream: AsyncIterable<unknown>,
  options: ConsumeModelStreamOptions = {},
): Promise<ConsumedModelStream> {
  const startedAt = new Date();
  const startedMs = Date.now();
  const events: ModelStreamEvent[] = [];
  let text = '';
  let completed = false;
  let cancelled = false;
  let timedOut = false;

  const iterator = stream[Symbol.asyncIterator]();

  try {
    while (true) {
      if (options.signal?.aborted) {
        cancelled = true;
        break;
      }

      const next = await nextWithControl(iterator, startedMs, options);
      if (next === 'cancelled') {
        cancelled = true;
        break;
      }
      if (next === 'timeout') {
        timedOut = true;
        break;
      }
      if (next.done) {
        completed = true;
        break;
      }

      const event = normalizeStreamEvent(next.value);
      if (!event) continue;

      events.push(event);
      if (event.type === 'text-delta') {
        text += event.text;
      } else if (event.type === 'done') {
        text = event.result.text;
        completed = true;
        break;
      }
    }
  } catch (error) {
    const cause = error instanceof Error ? error : new Error(String(error));
    throw new ModelStreamError(`Model stream failed: ${cause.message}`, text, events, cause);
  } finally {
    if (!completed && iterator.return) {
      await iterator.return();
    }
  }

  const endedAt = new Date();
  return {
    text,
    events,
    startedAt,
    endedAt,
    durationMs: Math.max(0, endedAt.getTime() - startedAt.getTime()),
    completed,
    cancelled,
    timedOut,
  };
}

async function nextWithControl(
  iterator: AsyncIterator<unknown>,
  startedMs: number,
  options: ConsumeModelStreamOptions,
): Promise<IteratorResult<unknown> | StreamControlResult> {
  const controls: Array<Promise<StreamControlResult>> = [];

  if (options.signal) {
    controls.push(waitForAbort(options.signal));
  }

  if (options.timeoutMs !== undefined) {
    const remainingMs = options.timeoutMs - (Date.now() - startedMs);
    if (remainingMs <= 0) return 'timeout';
    controls.push(waitForTimeout(remainingMs));
  }

  if (controls.length === 0) {
    return iterator.next();
  }

  return Promise.race([iterator.next(), ...controls]);
}

function waitForAbort(signal: AbortSignal): Promise<StreamControlResult> {
  if (signal.aborted) return Promise.resolve('cancelled');

  return new Promise(resolve => {
    signal.addEventListener('abort', () => resolve('cancelled'), { once: true });
  });
}

function waitForTimeout(timeoutMs: number): Promise<StreamControlResult> {
  return new Promise(resolve => {
    setTimeout(() => resolve('timeout'), timeoutMs);
  });
}

function normalizeExplicitEvent(record: Record<string, unknown>): ModelStreamEvent | null {
  if (record.type === 'text-delta' && typeof record.text === 'string') {
    return { type: 'text-delta', text: record.text };
  }

  if (record.type === 'file' && isGeneratedFile(record.file)) {
    return { type: 'file', file: record.file };
  }

  if (record.type === 'usage') {
    return {
      type: 'usage',
      ...(typeof record.inputTokens === 'number' ? { inputTokens: record.inputTokens } : {}),
      ...(typeof record.outputTokens === 'number' ? { outputTokens: record.outputTokens } : {}),
      ...(typeof record.costUsd === 'number' ? { costUsd: record.costUsd } : {}),
    };
  }

  if (record.type === 'error' && record.error instanceof Error) {
    return { type: 'error', error: record.error };
  }

  if (record.type === 'done' && isGenerateResult(record.result)) {
    return { type: 'done', result: record.result };
  }

  return null;
}

function isGeneratedFile(value: unknown): value is ModelGeneratedFile {
  return Boolean(
    value &&
      typeof value === 'object' &&
      typeof (value as Record<string, unknown>).path === 'string' &&
      typeof (value as Record<string, unknown>).content === 'string',
  );
}

function isGenerateResult(value: unknown): value is GenerateResult {
  return Boolean(
    value &&
      typeof value === 'object' &&
      typeof (value as Record<string, unknown>).text === 'string' &&
      Array.isArray((value as Record<string, unknown>).files),
  );
}

function readPath(value: unknown, path: Array<string | number>): unknown {
  let current = value;
  for (const segment of path) {
    if (typeof segment === 'number') {
      if (!Array.isArray(current)) return undefined;
      current = current[segment];
      continue;
    }

    if (!current || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}
