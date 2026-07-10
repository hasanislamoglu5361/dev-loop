import { describe, expect, it, vi } from 'vitest';
import { createCli, type StartUiServer } from '../cli.js';

describe('FEATURE095 - CLI ui command', () => {
  it('Test ui command starts the UI backend via injected startUiServer', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const startUiServer: StartUiServer = vi.fn(async options => ({
      app: {} as never,
      address: { host: options.host ?? '127.0.0.1', port: options.port ?? 3747 },
      stop: vi.fn(async () => ({ stopped: true })),
    }));
    const cli = createCli({ startUiServer });

    await cli.parseAsync(['node', 'dev-loop', 'ui', '--host', '0.0.0.0', '--port', '4000'], { from: 'node' });

    expect(startUiServer).toHaveBeenCalledWith(expect.objectContaining({ host: '0.0.0.0', port: 4000 }));
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('http://0.0.0.0:4000'));

    logSpy.mockRestore();
  });

  it('Test ui command defaults host/port when none provided', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const startUiServer: StartUiServer = vi.fn(async options => ({
      app: {} as never,
      address: { host: options.host ?? '127.0.0.1', port: options.port ?? 3747 },
      stop: vi.fn(async () => ({ stopped: true })),
    }));
    const cli = createCli({ startUiServer });

    await cli.parseAsync(['node', 'dev-loop', 'ui'], { from: 'node' });

    expect(startUiServer).toHaveBeenCalledWith(expect.objectContaining({ host: '127.0.0.1', port: 3747 }));

    logSpy.mockRestore();
  });
});
