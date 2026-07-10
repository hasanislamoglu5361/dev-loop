import { describe, expect, it } from 'vitest';
import { createUiServer, startUiServer } from '../index.js';

describe('FEATURE095 - Web UI Fastify Server', () => {
  it('Test health route', async () => {
    const app = createUiServer({ host: '127.0.0.1', port: 0 });

    const response = await app.inject({ method: 'GET', url: '/health' });
    const apiResponse = await app.inject({ method: 'GET', url: '/api/health' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      status: 'ok',
      service: 'dev-loop-ui',
    });
    expect(apiResponse.statusCode).toBe(200);
    await app.close();
  });

  it('Test graceful shutdown', async () => {
    const server = await startUiServer({ host: '127.0.0.1', port: 0 });

    expect(server.address.port).toBeGreaterThan(0);
    await expect(server.stop()).resolves.toEqual({ stopped: true });
    await expect(server.stop()).resolves.toEqual({ stopped: false });
  });
});
