import { EventEmitter } from 'node:events';
import type { Readable, Writable } from 'node:stream';
import { detectPromptInjection } from '../models/verifier/injection-detector.js';

export interface McpTransport {
  stdin: Writable;
  stdout: Readable;
  once(event: 'close' | 'error', listener: (...args: unknown[]) => void): this;
}

export interface McpTool { name: string; description?: string; inputSchema?: Record<string, unknown> }
export interface McpClientLog { direction: 'request' | 'response' | 'notification'; method?: string; id?: number; payload: unknown }
export interface McpProtocolClientOptions {
  serverName: string;
  transport: McpTransport;
  timeoutMs?: number;
  log?: (entry: McpClientLog) => void | Promise<void>;
}

interface PendingCall { resolve(value: unknown): void; reject(error: Error): void; timer: ReturnType<typeof setTimeout> }

export class McpProtocolClient extends EventEmitter {
  private readonly serverName: string;
  private readonly transport: McpTransport;
  private readonly timeoutMs: number;
  private readonly log?: McpProtocolClientOptions['log'];
  private readonly pending = new Map<number, PendingCall>();
  private nextId = 1;
  private buffer = '';
  private closed = false;

  constructor(options: McpProtocolClientOptions) {
    super();
    this.serverName = options.serverName;
    this.transport = options.transport;
    this.timeoutMs = options.timeoutMs ?? 10_000;
    this.log = options.log;
    options.transport.stdout.on('data', chunk => this.consume(String(chunk)));
    options.transport.once('close', () => this.close(new Error(`MCP server ${this.serverName} closed.`)));
    options.transport.once('error', error => this.close(error instanceof Error ? error : new Error(String(error))));
  }

  async initialize(): Promise<{ protocolVersion: string; capabilities: Record<string, unknown> }> {
    const result = await this.request('initialize', {
      protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'dev-loop', version: '0.1.0' },
    }) as { protocolVersion?: unknown; capabilities?: unknown };
    if (typeof result?.protocolVersion !== 'string' || !result.capabilities || typeof result.capabilities !== 'object') {
      throw new Error('MCP initialize returned an invalid result.');
    }
    this.notify('notifications/initialized', {});
    return { protocolVersion: result.protocolVersion, capabilities: result.capabilities as Record<string, unknown> };
  }

  async listTools(): Promise<McpTool[]> {
    const result = await this.request('tools/list', {}) as { tools?: unknown };
    if (!Array.isArray(result?.tools) || result.tools.some(tool => !tool || typeof tool !== 'object' || typeof (tool as { name?: unknown }).name !== 'string')) {
      throw new Error('MCP tools/list returned an invalid result.');
    }
    return result.tools as McpTool[];
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
    if (!/^[a-zA-Z0-9_.:/-]+$/.test(name)) throw new Error('Invalid MCP tool name.');
    const scan = detectPromptInjection(JSON.stringify(args));
    if (scan.detected) throw new Error('MCP tool input blocked by prompt-injection policy.');
    return this.request('tools/call', { name, arguments: args });
  }

  dispose(): void { this.close(new Error(`MCP client ${this.serverName} disposed.`)); }
  pendingCount(): number { return this.pending.size; }

  private request(method: string, params: Record<string, unknown>): Promise<unknown> {
    if (this.closed) return Promise.reject(new Error(`MCP client ${this.serverName} is closed.`));
    const id = this.nextId++;
    const payload = { jsonrpc: '2.0', id, method, params };
    this.write(payload);
    void this.log?.({ direction: 'request', method, id, payload: redact(payload) });
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`MCP ${method} timed out after ${this.timeoutMs}ms.`));
      }, this.timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
    });
  }

  private notify(method: string, params: Record<string, unknown>): void {
    const payload = { jsonrpc: '2.0', method, params };
    this.write(payload);
    void this.log?.({ direction: 'notification', method, payload: redact(payload) });
  }

  private write(payload: unknown): void { this.transport.stdin.write(`${JSON.stringify(payload)}\n`); }

  private consume(chunk: string): void {
    this.buffer += chunk;
    for (;;) {
      const newline = this.buffer.indexOf('\n');
      if (newline < 0) return;
      const line = this.buffer.slice(0, newline).trim();
      this.buffer = this.buffer.slice(newline + 1);
      if (!line) continue;
      let message: { id?: unknown; result?: unknown; error?: { message?: unknown } };
      try { message = JSON.parse(line) as typeof message; } catch { this.emit('warning', 'Invalid JSON from MCP server.'); continue; }
      void this.log?.({ direction: 'response', id: typeof message.id === 'number' ? message.id : undefined, payload: redact(message) });
      if (typeof message.id !== 'number') continue;
      const call = this.pending.get(message.id);
      if (!call) continue;
      clearTimeout(call.timer); this.pending.delete(message.id);
      if (message.error) call.reject(new Error(typeof message.error.message === 'string' ? message.error.message : 'MCP request failed.'));
      else call.resolve(message.result);
    }
  }

  private close(error: Error): void {
    if (this.closed) return;
    this.closed = true;
    for (const call of this.pending.values()) { clearTimeout(call.timer); call.reject(error); }
    this.pending.clear();
  }
}

function redact<T>(value: T): T {
  return JSON.parse(JSON.stringify(value, (key, entry) => /token|secret|password|api[_-]?key/i.test(key) ? '[REDACTED]' : entry)) as T;
}
