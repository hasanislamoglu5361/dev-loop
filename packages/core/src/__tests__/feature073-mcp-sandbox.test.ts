import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { McpSandbox } from '../runtime/mcp-sandbox.js';
import { cleanupTempProject, createTempProject } from './helpers/temp-dir.js';

describe('FEATURE073 - MCP Sandbox', () => {
  let projectDir: string | undefined;

  afterEach(() => {
    if (projectDir) {
      cleanupTempProject(projectDir);
      projectDir = undefined;
    }
  });

  it('Test safe file flow', async () => {
    projectDir = createTempProject('dev-loop-sandbox-');
    fs.mkdirSync(path.join(projectDir, 'src'), { recursive: true });
    fs.writeFileSync(path.join(projectDir, 'src/app.ts'), 'export const value = 1;\n');
    const sandbox = new McpSandbox({ projectDir });

    const writeResult = await sandbox.writeGeneratedFiles([
      { path: 'src/app.ts', content: 'export const value = 2;\n' },
      { path: 'src/new.ts', content: 'export const created = true;\n' },
    ]);

    expect(writeResult.files).toEqual(['src/app.ts', 'src/new.ts']);
    expect(fs.readFileSync(path.join(projectDir, 'src/app.ts'), 'utf8')).toBe('export const value = 1;\n');
    expect(fs.readFileSync(path.join(projectDir, '.dev-loop/sandbox/src/app.ts'), 'utf8')).toBe('export const value = 2;\n');

    const diff = await sandbox.diff();
    expect(diff.files).toEqual([
      expect.objectContaining({
        path: 'src/app.ts',
        status: 'modified',
        before: 'export const value = 1;\n',
        after: 'export const value = 2;\n',
      }),
      expect.objectContaining({
        path: 'src/new.ts',
        status: 'added',
        before: '',
        after: 'export const created = true;\n',
      }),
    ]);

    await sandbox.applyApprovedFiles(['src/app.ts', 'src/new.ts']);

    expect(fs.readFileSync(path.join(projectDir, 'src/app.ts'), 'utf8')).toBe('export const value = 2;\n');
    expect(fs.readFileSync(path.join(projectDir, 'src/new.ts'), 'utf8')).toBe('export const created = true;\n');
  });

  it('Test path traversal rejection', async () => {
    projectDir = createTempProject('dev-loop-sandbox-');
    const sandbox = new McpSandbox({ projectDir });

    await expect(sandbox.writeGeneratedFiles([
      { path: '../outside.ts', content: 'bad' },
    ])).rejects.toThrow('outside project root');

    await expect(sandbox.writeGeneratedFiles([
      { path: '/tmp/absolute.ts', content: 'bad' },
    ])).rejects.toThrow('Absolute paths are not allowed');
  });

  it('Test clear', async () => {
    projectDir = createTempProject('dev-loop-sandbox-');
    const sandbox = new McpSandbox({ projectDir });

    await sandbox.writeGeneratedFiles([
      { path: 'src/temp.ts', content: 'temporary\n' },
    ]);
    expect(fs.existsSync(path.join(projectDir, '.dev-loop/sandbox/src/temp.ts'))).toBe(true);

    await sandbox.clear();

    expect(fs.existsSync(path.join(projectDir, '.dev-loop/sandbox'))).toBe(false);
  });
});
