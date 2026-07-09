import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import { runCommand } from './helpers/commands.js';

describe('root package metadata', () => {
  it('declares package manager metadata required by turbo', () => {
    const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
    expect(pkg.packageManager ?? pkg.devEngines?.packageManager).toBeTruthy();
    expect(pkg.workspaces).toEqual(expect.arrayContaining(['packages/cli', 'packages/core', 'packages/ui']));
  });

  it('core package tarball includes runtime dist files and excludes tests', () => {
    const output = runCommand('npm', ['pack', '--workspace', '@dev-loop/core', '--dry-run', '--json']);
    const jsonStart = output.indexOf('[\n');
    expect(jsonStart).toBeGreaterThanOrEqual(0);

    const [packResult] = JSON.parse(output.slice(jsonStart)) as Array<{
      files: Array<{ path: string }>;
    }>;
    const paths = packResult.files.map(file => file.path);

    expect(paths).toContain('dist/index.js');
    expect(paths).toContain('dist/index.d.ts');
    expect(paths).toContain('dist/db/index.js');
    expect(paths.some(path => path.startsWith('src/__tests__/'))).toBe(false);
    expect(paths.some(path => path.startsWith('dist/__tests__/'))).toBe(false);
  });
});
