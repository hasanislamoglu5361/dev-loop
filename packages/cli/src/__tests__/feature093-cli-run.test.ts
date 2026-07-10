import { describe, expect, it, vi, afterEach } from 'vitest';
import { createCli, type WatchFactory } from '../cli.js';

describe('FEATURE093 - CLI Run, Watch, Verify, Test Commands', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('Test run --dry-run', async () => {
    const run = vi.fn(async () => ({ success: true }));
    const cli = createCli({ workflows: { run } });

    await cli.parseAsync(['node', 'dev-loop', 'run', 'FEATURE093', '--dry-run', '--project-dir', '/tmp/project'], { from: 'node' });

    expect(run).toHaveBeenCalledWith(expect.objectContaining({
      featureId: 'FEATURE093',
      projectDir: '/tmp/project',
      dryRun: true,
    }));
  });

  it('Test watch debounce with fake timers', async () => {
    vi.useFakeTimers();
    const run = vi.fn(async () => ({ success: true }));
    let triggerChange!: () => void;
    const watchFactory: WatchFactory = vi.fn((_projectDir, onChange) => {
      triggerChange = onChange;
      return { close: vi.fn() };
    });
    const cli = createCli({
      workflows: { run },
      watchFactory,
      watchDebounceMs: 50,
    });

    await cli.parseAsync(['node', 'dev-loop', 'watch', 'FEATURE093', '--project-dir', '/tmp/project'], { from: 'node' });
    triggerChange();
    triggerChange();
    await vi.advanceTimersByTimeAsync(49);
    expect(run).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);

    expect(run).toHaveBeenCalledTimes(1);
    expect(run).toHaveBeenCalledWith(expect.objectContaining({
      featureId: 'FEATURE093',
      projectDir: '/tmp/project',
      watch: true,
    }));
  });

  it('Test verify calls verifier-only path', async () => {
    const verify = vi.fn(async () => ({ verified: true }));
    const cli = createCli({ workflows: { verify } });

    await cli.parseAsync(['node', 'dev-loop', 'verify', 'FEATURE093', '--project-dir', '/tmp/project'], { from: 'node' });

    expect(verify).toHaveBeenCalledWith(expect.objectContaining({
      featureId: 'FEATURE093',
      projectDir: '/tmp/project',
      verifierOnly: true,
    }));
  });
});
