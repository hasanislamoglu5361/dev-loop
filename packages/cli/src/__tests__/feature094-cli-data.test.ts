import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createCli } from '../cli.js';

const tempDirs: string[] = [];

async function makeProject(): Promise<string> {
  const projectDir = await fs.mkdtemp(path.join(os.tmpdir(), 'dev-loop-cli-data-'));
  tempDirs.push(projectDir);
  return projectDir;
}

describe('FEATURE094 - CLI Logs, Config, Patterns, Export Commands', () => {
  afterEach(async () => {
    vi.restoreAllMocks();
    await Promise.all(tempDirs.splice(0).map(dir => fs.rm(dir, { recursive: true, force: true })));
  });

  it('Test config set nested value', async () => {
    const projectDir = await makeProject();
    const cli = createCli();

    await cli.parseAsync([
      'node',
      'dev-loop',
      'config',
      'set',
      'planning.primary.model',
      'gpt-5',
      '--project-dir',
      projectDir,
    ], { from: 'node' });

    await expect(fs.readFile(path.join(projectDir, 'dev-loop.yaml'), 'utf-8')).resolves.toContain('model: gpt-5');
  });

  it('Test logs table output', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const cli = createCli({
      dataApi: {
        logs: vi.fn(async () => [
          { id: 1, feature: 'FEATURE094', status: 'success' },
        ]),
      },
    });

    await cli.parseAsync(['node', 'dev-loop', 'logs', 'history', '--project-dir', '/tmp/project'], { from: 'node' });

    expect(log).toHaveBeenCalledWith(expect.stringContaining('feature'));
    expect(log).toHaveBeenCalledWith(expect.stringContaining('FEATURE094'));
  });

  it('Test query command rejects unsafe SQL through core', async () => {
    const unsafe = new Error('Unsafe SQL rejected.');
    const cli = createCli({
      dataApi: {
        query: vi.fn(async () => {
          throw unsafe;
        }),
      },
    });

    await expect(cli.parseAsync([
      'node',
      'dev-loop',
      'query',
      'DROP TABLE loops',
      '--project-dir',
      '/tmp/project',
    ], { from: 'node' })).rejects.toThrow('Unsafe SQL rejected.');
  });
});
