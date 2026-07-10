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
  it('matches TypeScript brace patterns', async () => {
    const projectDir = await tempProjectDir();
    await writeFixtureFiles(projectDir, [
      'src/a.ts',
      'src/b.tsx',
      'src/c.js',
    ]);

    const files = await globFiles('src/**/*.{ts,tsx}', { cwd: projectDir });

    expect(files).toEqual(['src/a.ts', 'src/b.tsx']);
  });

  it('honors ignore patterns such as node_modules', async () => {
    const projectDir = await tempProjectDir();
    await writeFixtureFiles(projectDir, [
      'src/a.ts',
      'node_modules/pkg/index.ts',
    ]);

    const files = await globFiles('**/*.ts', {
      cwd: projectDir,
      ignore: ['node_modules/**'],
    });

    expect(files).toEqual(['src/a.ts']);
  });

  it('returns deterministically sorted normalized file paths', async () => {
    const projectDir = await tempProjectDir();
    await writeFixtureFiles(projectDir, [
      'src/zeta.ts',
      'src/nested/alpha.ts',
      'src/beta.ts',
    ]);

    const files = await globFiles('src/**/*.ts', { cwd: projectDir });

    expect(files).toEqual([
      'src/beta.ts',
      'src/nested/alpha.ts',
      'src/zeta.ts',
    ]);
    expect(files.every(file => !file.includes('\\'))).toBe(true);
  });

  it('returns files only, not matching directories', async () => {
    const projectDir = await tempProjectDir();
    await fs.mkdir(path.join(projectDir, 'src/directory.ts'), { recursive: true });
    await writeFixtureFiles(projectDir, ['src/file.ts']);

    const files = await globFiles('src/**/*.ts', { cwd: projectDir });

    expect(files).toEqual(['src/file.ts']);
  });

  it('can exclude common generated folders by default', async () => {
    const projectDir = await tempProjectDir();
    await writeFixtureFiles(projectDir, [
      'src/source.ts',
      'dist/output.ts',
      'coverage/tmp.ts',
      '.turbo/cache.ts',
      'node_modules/pkg/index.ts',
    ]);

    const files = await globFiles('**/*.ts', {
      cwd: projectDir,
      excludeGenerated: true,
      dot: true,
    });

    expect(files).toEqual(['src/source.ts']);
  });
});
