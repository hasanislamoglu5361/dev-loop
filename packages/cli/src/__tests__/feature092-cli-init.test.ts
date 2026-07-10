import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createCli } from '../cli.js';

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
    const cli = createCli({ nodeVersion: 'v20.11.0' });

    await cli.parseAsync(['node', 'dev-loop', 'init', '--project-dir', projectDir], { from: 'node' });

    await expect(fs.stat(path.join(projectDir, 'dev-loop.yaml'))).resolves.toBeTruthy();
    await expect(fs.stat(path.join(projectDir, '.dev-loop', 'FEATURES.md'))).resolves.toBeTruthy();
    await expect(read(path.join(projectDir, '.gitignore'))).resolves.toContain('.dev-loop/dev-loop.db');
    await expect(read(path.join(projectDir, '.vscode', 'settings.json'))).resolves.toContain('.dev-loop/sandbox');
  });

  it('Test setup writes config from mocked answers', async () => {
    const projectDir = await makeProject();
    const cli = createCli({
      nodeVersion: 'v20.11.0',
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
    await fs.writeFile(path.join(projectDir, '.gitignore'), 'node_modules\n', 'utf-8');
    const cli = createCli({ nodeVersion: 'v20.11.0' });

    await cli.parseAsync(['node', 'dev-loop', 'init', '--project-dir', projectDir], { from: 'node' });

    await expect(read(path.join(projectDir, '.dev-loop', 'FEATURES.md'))).resolves.toBe('# My Features\n');
    await expect(read(path.join(projectDir, '.gitignore'))).resolves.toContain('node_modules');
    await expect(read(path.join(projectDir, '.gitignore'))).resolves.toContain('.dev-loop/dev-loop.db');
  });
});
