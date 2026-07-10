import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import { createUiServer } from '../index.js';

describe('FEATURE096 - Web UI API Routes and WebSocket', () => {
  it('Test dashboard route', async () => {
    const app = createUiServer({
      api: {
        dashboard: vi.fn(async () => ({ activeLoops: 2, failures: 1 })),
      },
    });

    const response = await app.inject({ method: 'GET', url: '/api/dashboard' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ activeLoops: 2, failures: 1 });
    await app.close();
  });

  it('Test config redaction', async () => {
    const app = createUiServer({
      api: {
        config: vi.fn(async () => ({
          planning: { primary: { api_key: 'sk-secret-value', model: 'safe-model' } },
          notifications: { slack: { webhook_url: 'https://hooks.slack.test/token' } },
        })),
      },
    });

    const response = await app.inject({ method: 'GET', url: '/api/config' });

    expect(response.statusCode).toBe(200);
    expect(JSON.stringify(response.json())).not.toContain('sk-secret-value');
    expect(response.json()).toEqual({
      planning: { primary: { api_key: '[REDACTED]', model: 'safe-model' } },
      notifications: { slack: { webhook_url: '[REDACTED]' } },
    });
    await app.close();
  });

  it('Test uncertain resolve', async () => {
    const resolveUncertain = vi.fn(async () => ({ id: 'u1', resolved: true }));
    const app = createUiServer({
      api: { resolveUncertain },
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/uncertain/u1/resolve',
      payload: { resolution: 'accepted' },
    });
    const invalid = await app.inject({
      method: 'POST',
      url: '/api/uncertain/u1/resolve',
      payload: { resolution: '' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ id: 'u1', resolved: true });
    expect(resolveUncertain).toHaveBeenCalledWith('u1', { resolution: 'accepted' });
    expect(invalid.statusCode).toBe(400);
    await app.close();
  });

  it('Test WebSocket connected event', async () => {
    const realtime = new EventEmitter();
    const app = createUiServer({ realtime });
    await app.ready();

    const ws = await (app as unknown as { injectWS(url: string): Promise<{
      once(event: 'message', listener: (data: Buffer) => void): void;
      close(): void;
    }> }).injectWS('/ws');
    const message = await new Promise<string>(resolve => {
      ws.once('message', data => resolve(data.toString()));
    });

    expect(JSON.parse(message)).toEqual({ type: 'connected' });
    ws.close();
    await app.close();
    expect(realtime.listenerCount('event')).toBe(0);
  });
});
