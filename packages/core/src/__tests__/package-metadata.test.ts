import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import { runCommand } from './helpers/commands.js';
import { readPackageJson } from './helpers/package-json.js';

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

  it('declares every package it imports directly as its own dependency (BUG035)', () => {
    // config/parse.ts imports `yaml` in production source; @dev-loop/core must
    // declare it itself instead of relying on root devDependency hoisting.
    const corePkg = readPackageJson('core') as { dependencies?: Record<string, string> };
    expect(corePkg.dependencies?.yaml).toBeTruthy();
  });

  it('resolves yaml from the core workspace itself, not only via root hoisting (BUG035)', () => {
    // `npm ls --workspace` reports the tree rooted at the repo root, with the
    // workspace package nested one level in. `npm ls` also exits non-zero when
    // a workspace has an unmet/undeclared dependency, even though it still
    // prints valid JSON describing what it found (or didn't).
    let output: string;
    try {
      output = runCommand('npm', ['ls', 'yaml', '--workspace', '@dev-loop/core', '--json']);
    } catch (error) {
      output = String((error as { stdout?: Buffer | string }).stdout ?? '');
    }

    const parsed = JSON.parse(output) as {
      dependencies?: Record<string, { dependencies?: Record<string, unknown> }>;
    };
    expect(parsed.dependencies?.['@dev-loop/core']?.dependencies?.yaml).toBeTruthy();
  });
});
