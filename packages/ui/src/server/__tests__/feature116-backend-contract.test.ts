import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import { createUiServer } from '../index.js';

describe('FEATURE116 UI backend contract', () => {
  it('validates numeric route IDs and returns a typed 400', async () => {
    const app = createUiServer();
    const response = await app.inject({ method: 'GET', url: '/api/loops/not-a-number/turns' });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ error: 'Invalid request.', issues: expect.any(Array) });
    await app.close();
  });

  it('returns operation identity and status for allowed mutations', async () => {
    const loopControl = vi.fn(async () => ({ accepted: true }));
    const app = createUiServer({ api: { loopControl } });
    const response = await app.inject({ method: 'POST', url: '/api/loop-control/pause', payload: { loopId: 3 } });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ operationId: expect.stringMatching(/^op-/), action: 'pause', status: 'completed', result: { accepted: true } });
    const rejected = await app.inject({ method: 'POST', url: '/api/loop-control/delete-everything', payload: {} });
    expect(rejected.statusCode).toBe(400);
    await app.close();
  });

  it('keeps API misses as JSON 404 instead of SPA fallback', async () => {
    const app = createUiServer(); const response = await app.inject({ method: 'GET', url: '/api/missing' });
    expect(response.statusCode).toBe(404); expect(response.headers['content-type']).toContain('application/json');
    await app.close();
  });

  it('streams versioned, ordered websocket envelopes and cleans listeners', async () => {
    const realtime = new EventEmitter(); const app = createUiServer({ realtime });
    const ws = await (app as unknown as { injectWS(): Promise<EventEmitter & { close(): void }> }).injectWS();
    const messages: unknown[] = []; ws.on('message', value => messages.push(JSON.parse(String(value))));
    realtime.emit('event', { type: 'loop:turn', loopId: 1 });
    await vi.waitFor(() => expect(messages).toHaveLength(2));
    expect(messages).toEqual([
      expect.objectContaining({ version: 1, sequence: 1, event: { type: 'connected', state: 'ready' } }),
      expect.objectContaining({ version: 1, sequence: 2, event: { type: 'loop:turn', loopId: 1 } }),
    ]);
    ws.close(); expect(realtime.listenerCount('event')).toBe(0); await app.close();
  });
});
