import { createRequire } from 'node:module';
import type { ChildProcessLike, SpawnLike } from '../utils/process.js';

const require = createRequire(import.meta.url);

interface CrossSpawnModule {
  default?: SpawnLike;
  spawn?: SpawnLike;
}

const crossSpawn = require('cross-spawn') as SpawnLike & CrossSpawnModule;
const defaultSpawn = crossSpawn.default ?? crossSpawn.spawn ?? crossSpawn;

export interface McpServerConfig {
  name: string;
  command: string;
  args?: string[];
  env?: Record<string, string>;
  auto_enable?: boolean;
  optional?: boolean;
  keywords?: string[];
}

export type McpManagerEvent = 'start' | 'stop' | 'warning';

export interface McpManagerLogEntry {
  event: McpManagerEvent;
  server: string;
  message: string;
}

export interface McpManagerOptions {
  projectDir: string;
  env?: NodeJS.ProcessEnv;
  spawn?: SpawnLike;
  log?: (entry: McpManagerLogEntry) => void;
}

export interface McpStartResult {
  started: string[];
  warnings: string[];
}

interface ResolvedServerEnv {
  env: NodeJS.ProcessEnv;
  missing: string[];
}

export class McpManager {
  private readonly active = new Map<string, ChildProcessLike>();
  private readonly projectDir: string;
  private readonly env: NodeJS.ProcessEnv;
  private readonly spawn: SpawnLike;
  private readonly log?: (entry: McpManagerLogEntry) => void;

  constructor(options: McpManagerOptions) {
    this.projectDir = options.projectDir;
    this.env = options.env ?? process.env;
    this.spawn = options.spawn ?? defaultSpawn;
    this.log = options.log;
  }

  async startAutoEnabledServers(servers: McpServerConfig[]): Promise<McpStartResult> {
    const started: string[] = [];
    const warnings: string[] = [];

    for (const server of servers) {
      if (!server.auto_enable) continue;

      const resolvedEnv = this.resolveServerEnv(server);
      if (resolvedEnv.missing.length > 0) {
        const warning = `MCP server "${server.name}" skipped: missing env var ${resolvedEnv.missing[0]}.`;
        warnings.push(warning);
        this.emitLog('warning', server.name, warning);
        continue;
      }

      try {
        const child = this.spawn(server.command, server.args ?? [], {
          cwd: this.projectDir,
          env: resolvedEnv.env,
          stdio: ['ignore', 'pipe', 'pipe'],
        });
        this.active.set(server.name, child);
        child.once('close', () => {
          if (this.active.get(server.name) === child) {
            this.active.delete(server.name);
          }
        });
        started.push(server.name);
        this.emitLog('start', server.name, `MCP server "${server.name}" started.`);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (!server.optional) {
          throw error;
        }

        const warning = `MCP server "${server.name}" skipped: ${message}`;
        warnings.push(warning);
        this.emitLog('warning', server.name, warning);
      }
    }

    return { started, warnings };
  }

  listActiveServers(): string[] {
    return Array.from(this.active.keys()).sort();
  }

  async stopAll(): Promise<void> {
    const entries = Array.from(this.active.entries());

    for (const [name, child] of entries) {
      child.kill('SIGTERM');
      this.active.delete(name);
      this.emitLog('stop', name, `MCP server "${name}" stopped.`);
    }
  }

  private resolveServerEnv(server: McpServerConfig): ResolvedServerEnv {
    const resolved: NodeJS.ProcessEnv = { ...process.env };
    const missing = new Set<string>();

    for (const [key, value] of Object.entries(server.env ?? {})) {
      resolved[key] = value.replace(/\$\{([A-Z0-9_]+)\}/gi, (_match, name: string) => {
        const envValue = this.env[name];
        if (envValue === undefined) {
          missing.add(name);
          return '';
        }

        return envValue;
      });
    }

    return {
      env: resolved,
      missing: Array.from(missing),
    };
  }

  private emitLog(event: McpManagerEvent, server: string, message: string): void {
    this.log?.({ event, server, message });
  }
}

export function suggestMcpServers(featureText: string, servers: McpServerConfig[]): string[] {
  const normalizedFeature = featureText.toLowerCase();

  return servers
    .filter(server => (server.keywords ?? []).some(keyword => normalizedFeature.includes(keyword.toLowerCase())))
    .map(server => server.name);
}
