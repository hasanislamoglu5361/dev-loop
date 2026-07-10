import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import { EventEmitter as NodeEventEmitter } from 'node:events';
import type { EventEmitter } from 'node:events';
import type { IncomingMessage } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { Duplex } from 'node:stream';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { z } from 'zod';
import {
  buildProjectRuntimePaths,
  createTestRunner,
  loadConfig,
  runLoop,
  runProcess,
} from '@dev-loop/core';
import {
  getAllBenchmarks,
  getErrorPatterns,
  getLatestQuality,
  getLoopTurns,
  getMcpUsage,
  getModelProfiles,
  getNotificationLog,
  getPlanningHistory,
  getRecentAnalytics,
  getRecentLoops,
  getUncertainTags,
  initDatabase,
  resolveUncertainTag,
  saveUserRating,
} from '@dev-loop/core/db';

export interface UiServerOptions {
  host?: string;
  port?: number;
  projectDir?: string;
  api?: UiApi;
  realtime?: EventEmitter;
}

export interface UiApi {
  dashboard?: () => Promise<unknown> | unknown;
  loops?: () => Promise<unknown> | unknown;
  turns?: (loopId: string) => Promise<unknown> | unknown;
  models?: () => Promise<unknown> | unknown;
  patterns?: () => Promise<unknown> | unknown;
  mcp?: () => Promise<unknown> | unknown;
  uncertain?: () => Promise<unknown> | unknown;
  resolveUncertain?: (id: string, input: { resolution: string }) => Promise<unknown> | unknown;
  quality?: () => Promise<unknown> | unknown;
  planning?: () => Promise<unknown> | unknown;
  reports?: () => Promise<unknown> | unknown;
  notifications?: () => Promise<unknown> | unknown;
  config?: () => Promise<unknown> | unknown;
  loopControl?: (action: string, input: Record<string, unknown>) => Promise<unknown> | unknown;
  voice?: (input: Record<string, unknown>) => Promise<unknown> | unknown;
  ratings?: (input: Record<string, unknown>) => Promise<unknown> | unknown;
}

export interface UiServerController {
  app: FastifyInstance;
  address: {
    host: string;
    port: number;
  };
  stop(): Promise<{ stopped: boolean }>;
}

export function createUiServer(_options: UiServerOptions = {}): FastifyInstance {
  const app = Fastify({ logger: false });
  const api = createUiApi(_options.api ?? (_options.projectDir ? createProjectUiApi(_options.projectDir) : {}));

  const health = async () => ({
    status: 'ok',
    service: 'dev-loop-ui',
  });

  app.get('/health', health);
  app.get('/api/health', health);
  app.get('/api/dashboard', async () => api.dashboard());
  app.get('/api/loops', async () => api.loops());
  app.get('/api/loops/:id/turns', async request => {
    const params = z.object({ id: z.string().min(1) }).parse(request.params);
    return api.turns(params.id);
  });
  app.get('/api/models', async () => api.models());
  app.get('/api/patterns', async () => api.patterns());
  app.get('/api/mcp', async () => api.mcp());
  app.get('/api/uncertain', async () => api.uncertain());
  app.post('/api/uncertain/:id/resolve', async (request, reply) => {
    const params = z.object({ id: z.string().min(1) }).parse(request.params);
    const body = z.object({ resolution: z.string().min(1) }).safeParse(request.body);
    if (!body.success) {
      return reply.status(400).send({ error: 'Invalid request body.' });
    }
    return api.resolveUncertain(params.id, body.data);
  });
  app.get('/api/quality', async () => api.quality());
  app.get('/api/planning', async () => api.planning());
  app.get('/api/reports', async () => api.reports());
  app.get('/api/notifications', async () => api.notifications());
  app.get('/api/config', async () => redactSecrets(await api.config()));
  app.post('/api/loop-control/:action', async request => {
    const params = z.object({ action: z.string().min(1) }).parse(request.params);
    const body = z.record(z.unknown()).default({}).parse(request.body ?? {});
    return api.loopControl(params.action, body);
  });
  app.post('/api/voice', async request => {
    const body = z.record(z.unknown()).default({}).parse(request.body ?? {});
    return api.voice(body);
  });
  app.post('/api/ratings', async request => {
    const body = z.record(z.unknown()).default({}).parse(request.body ?? {});
    return api.ratings(body);
  });

  app.get('/ws', async (_request, reply) => {
    return reply.status(426).send({ error: 'WebSocket upgrade required.' });
  });
  installWebSocketServer(app, _options.realtime);
  installInjectWs(app, _options.realtime);

  const clientRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../dist-client');
  app.get('/assets/*', async (request, reply) => {
    const wildcard = (request.params as { '*': string })['*'];
    const assetPath = safeClientPath(clientRoot, path.join('assets', wildcard));
    if (!assetPath) return reply.status(404).send({ error: 'Not Found' });
    try {
      const body = await readFile(assetPath);
      return reply.type(contentType(assetPath)).send(body);
    } catch {
      return reply.status(404).send({ error: 'Not Found' });
    }
  });

  app.setNotFoundHandler(async (request, reply) => {
    if (request.url.startsWith('/api/')) {
      return reply.status(404).send({
        error: 'Not Found',
      });
    }

    try {
      return reply.status(200).type('text/html').send(await readFile(path.join(clientRoot, 'index.html'), 'utf8'));
    } catch {
      return reply.status(503).type('text/html').send(
        '<!doctype html><title>dev-loop unavailable</title><h1>UI client is not built</h1><p>Run npm run build first.</p>',
      );
    }
  });


  return app;
}

function createProjectUiApi(projectDir: string): UiApi {
  const withDatabase = <T>(operation: () => T | Promise<T>): Promise<T> => {
    const runtime = buildProjectRuntimePaths(projectDir);
    initDatabase(path.join(runtime.runtimeRoot, 'dev-loop.db'));
    return Promise.resolve(operation());
  };

  return {
    dashboard: () => withDatabase(async () => {
      const [analytics, recentLoops] = await Promise.all([getRecentAnalytics(), getRecentLoops(10)]);
      return {
        status: analytics.totalLoops > 0 ? 'ready' : 'idle',
        metrics: {
          activeLoops: recentLoops.filter(loop => loop.completed_at == null).length,
          successRate: analytics.successRate,
          costUsd: analytics.totalCost,
        },
        recentLoops: recentLoops.map(loop => ({
          id: String(loop.id),
          feature: String(loop.feature_id ?? ''),
          status: loop.completed_at == null ? 'active' : Number(loop.success) === 1 ? 'success' : 'failed',
        })),
      };
    }),
    loops: () => withDatabase(async () => {
      const loops = await getRecentLoops(100);
      return { loops, total: loops.length };
    }),
    turns: loopId => withDatabase(() => getLoopTurns(Number(loopId))),
    models: () => withDatabase(() => getModelProfiles()),
    patterns: () => withDatabase(() => getErrorPatterns()),
    mcp: () => withDatabase(async () => ({ usage: await getMcpUsage() })),
    uncertain: () => withDatabase(() => getUncertainTags()),
    resolveUncertain: (id, input) => withDatabase(async () => {
      await resolveUncertainTag(Number(id), input.resolution);
      return { id, resolved: true, resolution: input.resolution };
    }),
    quality: () => withDatabase(async () => await getLatestQuality() ?? { status: 'unknown' }),
    planning: () => withDatabase(async () => ({ tasks: await getPlanningHistory() })),
    reports: () => withDatabase(() => getAllBenchmarks()),
    notifications: () => withDatabase(() => getNotificationLog()),
    config: () => loadConfig({ projectDir, invalidConfig: 'warn-and-default' }),
    loopControl: async (action, input) => {
      if (action === 'run') {
        const featureId = typeof input.featureId === 'string' ? input.featureId : 'FEATURES';
        return runLoop(featureId, { projectDir });
      }
      if (action === 'verify') {
        const config = await loadConfig({ projectDir });
        return createTestRunner().run({ config: config.test_runner, projectDir });
      }
      if (action === 'build') {
        return runProcess('npm', ['run', 'build'], { cwd: projectDir });
      }
      throw new Error(`Unsupported loop control action: ${action}`);
    },
    voice: input => ({ accepted: true, text: String(input.text ?? '') }),
    ratings: input => withDatabase(async () => {
      const loopId = Number(input.loopId);
      const rating = Number(input.rating);
      if (!Number.isSafeInteger(loopId) || !Number.isFinite(rating)) throw new Error('loopId and rating are required.');
      await saveUserRating({ loopId, rating, comment: typeof input.comment === 'string' ? input.comment : undefined });
      return { saved: true, loopId, rating };
    }),
  };
}

function safeClientPath(root: string, relativePath: string): string | null {
  const candidate = path.resolve(root, relativePath);
  return candidate === root || candidate.startsWith(`${root}${path.sep}`) ? candidate : null;
}

function contentType(filePath: string): string {
  if (filePath.endsWith('.js')) return 'text/javascript; charset=utf-8';
  if (filePath.endsWith('.css')) return 'text/css; charset=utf-8';
  if (filePath.endsWith('.svg')) return 'image/svg+xml';
  if (filePath.endsWith('.json')) return 'application/json; charset=utf-8';
  return 'application/octet-stream';
}

export async function startUiServer(options: UiServerOptions = {}): Promise<UiServerController> {
  const app = createUiServer(options);
  const host = options.host ?? '127.0.0.1';
  const port = options.port ?? 3747;
  let stopped = false;

  await app.listen({ host, port });
  const address = app.server.address() as AddressInfo;

  return {
    app,
    address: {
      host,
      port: address.port,
    },
    async stop(): Promise<{ stopped: boolean }> {
      if (stopped) {
        return { stopped: false };
      }

      stopped = true;
      await app.close();
      return { stopped: true };
    },
  };
}

function createUiApi(overrides: UiApi = {}): Required<UiApi> {
  return {
    dashboard: overrides.dashboard ?? (() => ({ activeLoops: 0, failures: 0 })),
    loops: overrides.loops ?? (() => []),
    turns: overrides.turns ?? (() => []),
    models: overrides.models ?? (() => []),
    patterns: overrides.patterns ?? (() => []),
    mcp: overrides.mcp ?? (() => ({ servers: [] })),
    uncertain: overrides.uncertain ?? (() => []),
    resolveUncertain: overrides.resolveUncertain ?? ((id, input) => ({ id, resolved: true, ...input })),
    quality: overrides.quality ?? (() => ({ status: 'unknown' })),
    planning: overrides.planning ?? (() => ({ tasks: [] })),
    reports: overrides.reports ?? (() => []),
    notifications: overrides.notifications ?? (() => []),
    config: overrides.config ?? (() => ({})),
    loopControl: overrides.loopControl ?? ((action, input) => ({ action, accepted: true, input })),
    voice: overrides.voice ?? (input => ({ accepted: true, input })),
    ratings: overrides.ratings ?? (input => ({ accepted: true, input })),
  };
}

function redactSecrets(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(item => redactSecrets(item));
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, raw]) => [
      key,
      isSecretKey(key) ? '[REDACTED]' : redactSecrets(raw),
    ]));
  }

  if (typeof value === 'string' && /\bsk-[A-Za-z0-9_-]+\b/.test(value)) {
    return '[REDACTED]';
  }

  return value;
}

function isSecretKey(key: string): boolean {
  return /api[_-]?key|token|secret|password|webhook/i.test(key);
}

interface WsConnection {
  send(data: string): void;
  on(event: 'close', listener: () => void): void;
}

function bindWsConnection(ws: WsConnection, realtime?: EventEmitter): void {
  const sendEvent = (event: unknown): void => {
    ws.send(JSON.stringify(event));
  };

  realtime?.on('event', sendEvent);
  ws.on('close', () => {
    realtime?.off('event', sendEvent);
  });
  sendEvent({ type: 'connected' });
}

function installWebSocketServer(app: FastifyInstance, realtime?: EventEmitter): void {
  const wss = new WebSocketServer({ noServer: true });

  app.server.on('upgrade', (request: IncomingMessage, socket: Duplex, head: Buffer) => {
    if (request.url !== '/ws') {
      socket.destroy();
      return;
    }

    wss.handleUpgrade(request, socket, head, ws => {
      bindWsConnection(ws, realtime);
      wss.emit('connection', ws, request);
    });
  });

  app.addHook('onClose', async () => {
    wss.close();
  });
}

function installInjectWs(app: FastifyInstance, realtime?: EventEmitter): void {
  type InjectedWs = NodeEventEmitter & {
    send(data: string): void;
    close(): void;
    terminate(): void;
  };
  const testable = app as FastifyInstance & {
    injectWS?: (url?: string) => Promise<InjectedWs>;
  };

  testable.injectWS = async (url = '/ws') => {
    if (url !== '/ws') {
      throw new Error(`No websocket route registered for ${url}`);
    }

    const ws = new NodeEventEmitter() as InjectedWs;
    ws.send = () => {};
    ws.close = () => ws.emit('close');
    ws.terminate = ws.close;
    bindWsConnection({
      send: data => setImmediate(() => ws.emit('message', Buffer.from(data))),
      on: (event, listener) => { ws.on(event, listener); },
    }, realtime);
    return ws;
  };
}
