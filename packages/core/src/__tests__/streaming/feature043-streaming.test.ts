import { describe, expect, it } from 'vitest';
import {
  consumeModelStream,
  ModelStreamError,
  normalizeStreamEvent,
} from '../../models/streaming.js';

async function* normalStream(): AsyncIterable<unknown> {
  yield 'Hel';
  yield { type: 'text-delta', text: 'lo' };
  yield { choices: [{ delta: { content: ', ' } }] };
  yield { type: 'content_block_delta', delta: { text: 'world' } };
  yield { message: { content: '!' } };
}

async function* failingStream(): AsyncIterable<unknown> {
  yield 'partial';
  throw new Error('provider stream failed');
}

async function* neverEndingStream(): AsyncIterable<unknown> {
  while (true) {
    await new Promise(resolve => setTimeout(resolve, 50));
    yield 'tick';
  }
}

describe('FEATURE043 - Streaming Response Helpers', () => {
  it('normalizes provider-neutral text deltas without assuming one vendor shape', () => {
    expect(normalizeStreamEvent('plain')).toEqual({ type: 'text-delta', text: 'plain' });
    expect(normalizeStreamEvent({ choices: [{ delta: { content: 'openai-ish' } }] })).toEqual({
      type: 'text-delta',
      text: 'openai-ish',
    });
    expect(normalizeStreamEvent({ type: 'content_block_delta', delta: { text: 'anthropic-ish' } })).toEqual({
      type: 'text-delta',
      text: 'anthropic-ish',
    });
    expect(normalizeStreamEvent({ message: { content: 'local-ish' } })).toEqual({
      type: 'text-delta',
      text: 'local-ish',
    });
  });

  it('accumulates final text and tracks stream timing', async () => {
    const result = await consumeModelStream(normalStream());

    expect(result.text).toBe('Hello, world!');
    expect(result.completed).toBe(true);
    expect(result.cancelled).toBe(false);
    expect(result.timedOut).toBe(false);
    expect(result.events.map(event => event.type)).toEqual([
      'text-delta',
      'text-delta',
      'text-delta',
      'text-delta',
      'text-delta',
    ]);
    expect(result.startedAt).toBeInstanceOf(Date);
    expect(result.endedAt).toBeInstanceOf(Date);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('throws a typed stream error with partial text when the stream fails', async () => {
    await expect(consumeModelStream(failingStream())).rejects.toMatchObject({
      name: 'ModelStreamError',
      partialText: 'partial',
      message: expect.stringContaining('provider stream failed'),
    });

    await expect(consumeModelStream(failingStream())).rejects.toBeInstanceOf(ModelStreamError);
  });

  it('supports timeout without hanging on a never-ending stream', async () => {
    const result = await consumeModelStream(neverEndingStream(), { timeoutMs: 5 });

    expect(result.completed).toBe(false);
    expect(result.timedOut).toBe(true);
    expect(result.cancelled).toBe(false);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('supports cancellation with partial output preserved', async () => {
    const controller = new AbortController();

    async function* cancellableStream(): AsyncIterable<unknown> {
      yield 'partial';
      controller.abort();
      yield 'ignored';
    }

    const result = await consumeModelStream(cancellableStream(), { signal: controller.signal });

    expect(result.text).toBe('partial');
    expect(result.completed).toBe(false);
    expect(result.cancelled).toBe(true);
    expect(result.timedOut).toBe(false);
  });
});
