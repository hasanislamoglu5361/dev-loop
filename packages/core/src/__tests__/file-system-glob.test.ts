import { describe, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { globFiles } from '../utils/file-system.js';

async function tempProjectDir(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), 'dev-loop-glob-'));
}

async function writeFixtureFiles(projectDir: string, files: string[]): Promise<void> {
  for (const file of files) {
    const fullPath = path.join(projectDir, file);
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, '');
  }
}

describe('globFiles', () => {
  it('matches brace patterns and ignores node_modules', async () => {
    const projectDir = await tempProjectDir();
    await writeFixtureFiles(projectDir, [
      'src/a.ts',
      'src/b.tsx',
      'src/c.js',
      'node_modules/pkg/index.ts',
    ]);

    const files = await globFiles(['src/**/*.{ts,tsx}'], {
      cwd: projectDir,
      ignore: ['node_modules/**'],
    });

    expect(files).toEqual(['src/a.ts', 'src/b.tsx']);
  });
});
