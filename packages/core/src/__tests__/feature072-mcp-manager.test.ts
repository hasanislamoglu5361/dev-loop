import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { describe, expect, it, vi } from 'vitest';
import {
  McpManager,
  suggestMcpServers,
} from '../runtime/mcp-manager.js';
import type { McpServerConfig } from '../runtime/mcp-manager.js';
import type { SpawnLike } from '../utils/process.js';

class FakeChildProcess extends EventEmitter {
  stdout = new PassThrough();
  stderr = new PassThrough();
  kill = vi.fn(() => {
    this.emit('close', 0);
    return true;
  });
}

function createSpawn(): { spawn: SpawnLike; children: FakeChildProcess[] } {
  const children: FakeChildProcess[] = [];
  const spawn: SpawnLike = vi.fn(() => {
    const child = new FakeChildProcess();
    children.push(child);
    return child;
  });

  return { spawn, children };
}

describe('FEATURE072 - MCP Manager Lifecycle', () => {
  it('Test start/stop', async () => {
    const { spawn, children } = createSpawn();
    const log = vi.fn();
    const manager = new McpManager({
      projectDir: '/tmp/project',
      spawn,
      env: { MCP_TOKEN: 'super-secret-token' },
      log,
    });

    const result = await manager.startAutoEnabledServers([
      {
        name: 'filesystem',
        command: 'node',
        args: ['server.js'],
        env: { TOKEN: '${MCP_TOKEN}' },
        auto_enable: true,
      },
      {
        name: 'browser',
        command: 'node',
        args: ['browser.js'],
        auto_enable: false,
      },
    ]);

    expect(result.started).toEqual(['filesystem']);
    expect(manager.listActiveServers()).toEqual(['filesystem']);
    expect(spawn).toHaveBeenCalledOnce();
    expect(spawn).toHaveBeenCalledWith('node', ['server.js'], expect.objectContaining({
      cwd: '/tmp/project',
      env: expect.objectContaining({ TOKEN: 'super-secret-token' }),
    }));
    expect(JSON.stringify(log.mock.calls)).not.toContain('super-secret-token');

    await manager.stopAll();

    expect(children[0]?.kill).toHaveBeenCalledWith('SIGTERM');
    expect(manager.listActiveServers()).toEqual([]);
    expect(log.mock.calls.map(call => call[0].event)).toEqual(['start', 'stop']);
  });

  it('Test missing env warning without secret logging', async () => {
    const { spawn } = createSpawn();
    const log = vi.fn();
    const manager = new McpManager({
      projectDir: '/tmp/project',
      spawn,
      env: { REAL_TOKEN: 'do-not-log-me' },
      log,
    });

    const result = await manager.startAutoEnabledServers([
      {
        name: 'jira',
        command: 'jira-mcp',
        env: { TOKEN: '${MISSING_TOKEN}', REAL: '${REAL_TOKEN}' },
        auto_enable: true,
      },
    ]);

    expect(result.started).toEqual([]);
    expect(result.warnings).toEqual([
      'MCP server "jira" skipped: missing env var MISSING_TOKEN.',
    ]);
    expect(spawn).not.toHaveBeenCalled();
    expect(JSON.stringify(log.mock.calls)).toContain('MISSING_TOKEN');
    expect(JSON.stringify(log.mock.calls)).not.toContain('do-not-log-me');
  });

  it('Test suggestions', () => {
    const servers: McpServerConfig[] = [
      { name: 'filesystem', command: 'fs-mcp', keywords: ['file', 'readme', 'source'] },
      { name: 'jira', command: 'jira-mcp', keywords: ['jira', 'ticket', 'issue'] },
      { name: 'postgres', command: 'pg-mcp', keywords: ['sql', 'database', 'migration'] },
    ];

    expect(suggestMcpServers('Update the Jira ticket and inspect SQL migrations', servers)).toEqual([
      'jira',
      'postgres',
    ]);
  });

  it('does not crash when an optional server fails to spawn', async () => {
    const spawn: SpawnLike = vi.fn(() => {
      throw new Error('missing binary');
    });
    const manager = new McpManager({ projectDir: '/tmp/project', spawn });

    const result = await manager.startAutoEnabledServers([
      {
        name: 'optional-docs',
        command: 'docs-mcp',
        auto_enable: true,
        optional: true,
      },
    ]);

    expect(result.started).toEqual([]);
    expect(result.warnings).toEqual([
      'MCP server "optional-docs" skipped: missing binary',
    ]);
    expect(manager.listActiveServers()).toEqual([]);
  });
});
