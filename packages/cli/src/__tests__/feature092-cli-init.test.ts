import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createCli, detectSetupEnvironment } from '../cli.js';

const environmentProbe = async () => ({
  nodeVersion: 'v20.11.0', supported: true, platform: process.platform,
  claudeCli: false, codexCli: false, lmStudio: false, ollama: false,
  messages: [],
});

const tempDirs: string[] = [];

async function makeProject(): Promise<string> {
  const projectDir = await fs.mkdtemp(path.join(os.tmpdir(), 'dev-loop-cli-'));
  tempDirs.push(projectDir);
  return projectDir;
}

async function read(filePath: string): Promise<string> {
  return fs.readFile(filePath, 'utf-8');
}

describe('FEATURE092 - CLI Init and Setup Commands', () => {
  afterEach(async () => {
    await Promise.all(tempDirs.splice(0).map(dir => fs.rm(dir, { recursive: true, force: true })));
  });

  it('Test init creates expected files', async () => {
    const projectDir = await makeProject();
    const cli = createCli({ nodeVersion: 'v20.11.0', environmentProbe });

    await cli.parseAsync(['node', 'dev-loop', 'init', '--project-dir', projectDir], { from: 'node' });

    await expect(fs.stat(path.join(projectDir, 'dev-loop.yaml'))).resolves.toBeTruthy();
    await expect(fs.stat(path.join(projectDir, '.dev-loop', 'FEATURES.md'))).resolves.toBeTruthy();
    await expect(fs.stat(path.join(projectDir, '.dev-loop', 'dev-loop.db'))).resolves.toBeTruthy();
    await expect(read(path.join(projectDir, '.dev-loop', 'CODE_MAP.md'))).resolves.toContain('# Code Map');
    await expect(read(path.join(projectDir, '.gitignore'))).resolves.toContain('.dev-loop/dev-loop.db');
    await expect(read(path.join(projectDir, '.vscode', 'settings.json'))).resolves.toContain('.dev-loop/sandbox');
  });

  it('Test setup writes config from mocked answers', async () => {
    const projectDir = await makeProject();
    const cli = createCli({
      nodeVersion: 'v20.11.0',
      environmentProbe,
      prompt: async () => ({
        planningProvider: 'openai',
        planningModel: 'gpt-5',
        testCommand: 'npm test',
      }),
    });

    await cli.parseAsync(['node', 'dev-loop', 'setup', '--project-dir', projectDir], { from: 'node' });

    const config = await read(path.join(projectDir, 'dev-loop.yaml'));
    expect(config).toContain('provider: openai');
    expect(config).toContain('model: gpt-5');
    expect(config).toContain('command: npm test');
  });

  it('Test existing files preserved', async () => {
    const projectDir = await makeProject();
    await fs.mkdir(path.join(projectDir, '.dev-loop'), { recursive: true });
    await fs.writeFile(path.join(projectDir, '.dev-loop', 'FEATURES.md'), '# My Features\n', 'utf-8');
    await fs.writeFile(path.join(projectDir, '.dev-loop', 'CODE_MAP.md'), '# My Code Map\n', 'utf-8');
    await fs.writeFile(path.join(projectDir, '.gitignore'), 'node_modules\n', 'utf-8');
    const cli = createCli({ nodeVersion: 'v20.11.0', environmentProbe });

    await cli.parseAsync(['node', 'dev-loop', 'init', '--project-dir', projectDir], { from: 'node' });

    await expect(read(path.join(projectDir, '.dev-loop', 'FEATURES.md'))).resolves.toBe('# My Features\n');
    await expect(read(path.join(projectDir, '.dev-loop', 'CODE_MAP.md'))).resolves.toBe('# My Code Map\n');
    await expect(read(path.join(projectDir, '.gitignore'))).resolves.toContain('node_modules');
    await expect(read(path.join(projectDir, '.gitignore'))).resolves.toContain('.dev-loop/dev-loop.db');
  });

  it('fails unsupported Node before creating any project files', async () => {
    const projectDir = await makeProject();
    const cli = createCli({ nodeVersion: 'v19.9.0' });

    await expect(cli.parseAsync(['node', 'dev-loop', 'init', '--project-dir', projectDir], { from: 'node' }))
      .rejects.toThrow(/Node\.js 20 or newer/);
    await expect(fs.stat(path.join(projectDir, 'dev-loop.yaml'))).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('supports documented non-interactive setup defaults', async () => {
    const projectDir = await makeProject();
    const cli = createCli({ nodeVersion: 'v20.11.0', environmentProbe });

    await cli.parseAsync(['node', 'dev-loop', 'setup', '--non-interactive', '--project-dir', projectDir], { from: 'node' });

    await expect(read(path.join(projectDir, 'dev-loop.yaml'))).resolves.toContain('provider: anthropic');
  });

  it('reports fully detected and fully unavailable environments with bounded probes', async () => {
    const commandCalls: Array<[string, number]> = [];
    const full = await detectSetupEnvironment('v20.11.0', {
      timeoutMs: 25,
      platform: 'linux',
      runCommand: async (command, _args, timeout) => { commandCalls.push([command, timeout]); return true; },
      fetchUrl: async (_url, timeout) => timeout === 25,
    });
    expect(full).toMatchObject({ supported: true, platform: 'linux', claudeCli: true, codexCli: true, lmStudio: true, ollama: true });
    expect(commandCalls).toEqual([['claude', 25], ['codex', 25]]);

    const none = await detectSetupEnvironment('v20.11.0', {
      runCommand: async () => false,
      fetchUrl: async () => false,
    });
    expect(none).toMatchObject({ claudeCli: false, codexCli: false, lmStudio: false, ollama: false });
    expect(none.messages.join(' ')).toContain('start ollama serve');
  });

  it('turns probe failures and timeouts into optional unavailable results', async () => {
    const report = await detectSetupEnvironment('v20.11.0', {
      runCommand: async () => { throw new Error('timed out'); },
      fetchUrl: async () => { throw new DOMException('timed out', 'TimeoutError'); },
    });
    expect(report).toMatchObject({ supported: true, claudeCli: false, codexCli: false, lmStudio: false, ollama: false });
  });
});
