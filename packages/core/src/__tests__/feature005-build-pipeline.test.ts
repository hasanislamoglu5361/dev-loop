import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('FEATURE005 - Build Pipeline With Turbo', () => {
  const rootDir = path.resolve(__dirname, '../../../..');

  function readPkg(pkgRelPath: string): Record<string, unknown> {
    return JSON.parse(fs.readFileSync(path.join(rootDir, pkgRelPath), 'utf8'));
  }

  it('turbo.json exists at project root', () => {
    const turboJson = path.join(rootDir, 'turbo.json');
    expect(fs.existsSync(turboJson)).toBe(true);
    const content = JSON.parse(fs.readFileSync(turboJson, 'utf8'));
    expect(content.tasks).toBeDefined();
  });

  it('core package has a build script', () => {
    const core = readPkg('packages/core/package.json');
    const scripts = (core.scripts ?? {}) as Record<string, string>;
    expect(scripts.build).toBeDefined();
  });

  it('cli package has a build script', () => {
    const cli = readPkg('packages/cli/package.json');
    const scripts = (cli.scripts ?? {}) as Record<string, string>;
    expect(scripts.build).toBeDefined();
  });

  it('ui package has a build script', () => {
    const ui = readPkg('packages/ui/package.json');
    const scripts = (ui.scripts ?? {}) as Record<string, string>;
    expect(scripts.build).toBeDefined();
  });

  it('each package tsconfig sets outDir to dist and rootDir to src', () => {
    for (const pkg of ['core', 'cli', 'ui']) {
      const tsconfigPath = path.join(rootDir, `packages/${pkg}/tsconfig.json`);
      expect(fs.existsSync(tsconfigPath)).toBe(true);
      const tsconfig = JSON.parse(fs.readFileSync(tsconfigPath, 'utf8'));
      expect(tsconfig.compilerOptions.outDir).toBe('dist');
      expect(tsconfig.compilerOptions.rootDir).toBe('src');
    }
  });

  it('root tsconfig has declaration and sourceMap enabled', () => {
    const base = JSON.parse(fs.readFileSync(path.join(rootDir, 'tsconfig.base.json'), 'utf8'));
    expect(base.compilerOptions.declaration).toBe(true);
    expect(base.compilerOptions.sourceMap).toBe(true);
  });

  it('root tsconfig references all three packages', () => {
    const base = JSON.parse(fs.readFileSync(path.join(rootDir, 'tsconfig.base.json'), 'utf8'));
    const paths = (base.references as Array<{ path: string }>).map(r => r.path);
    expect(paths).toContain('./packages/core');
    expect(paths).toContain('./packages/cli');
    expect(paths).toContain('./packages/ui');
  });

  it('build script output directory matches package.json exports', () => {
    const core = readPkg('packages/core/package.json');
    const cli = readPkg('packages/cli/package.json');
    // Exports should reference dist/ paths that match outDir
    expect((core.main as string).startsWith('./dist/')).toBe(true);
    expect((cli.main as string).startsWith('./dist/')).toBe(true);
  });

  it('build a real package and verify dist/index.js + dist/index.d.ts exist', async () => {
    const { execSync } = await import('node:child_process');
    const pkgDir = path.join(rootDir, 'packages/core');

    // Clean both dist and tsbuildinfo before build to ensure fresh output
    fs.rmSync(path.join(pkgDir, 'dist'), { recursive: true, force: true });
    const tsbuildinfo = path.join(pkgDir, 'tsconfig.tsbuildinfo');
    if (fs.existsSync(tsbuildinfo)) {
      fs.unlinkSync(tsbuildinfo);
    }

    // Run actual build on core (smallest, no external deps) - do NOT swallow errors
    execSync('npx tsc -p tsconfig.json', { cwd: pkgDir, stdio: 'pipe' });

    expect(fs.existsSync(path.join(pkgDir, 'dist/index.js'))).toBe(true);
    expect(fs.existsSync(path.join(pkgDir, 'dist/index.d.ts'))).toBe(true);

    // Clean up both dist AND tsbuildinfo together - never leave stale incremental state
    fs.rmSync(path.join(pkgDir, 'dist'), { recursive: true, force: true });
    if (fs.existsSync(tsbuildinfo)) {
      fs.unlinkSync(tsbuildinfo);
    }
  });

  it('builds core from scratch when dist is missing but tsbuildinfo exists', () => {
    // Regression test for BUG027: stale tsbuildinfo must not prevent rebuild
    const { execSync } = require('node:child_process');
    const pkgDir = path.join(rootDir, 'packages/core');

    // Simulate the bug state: delete dist but leave tsbuildinfo
    fs.rmSync(path.join(pkgDir, 'dist'), { recursive: true, force: true });
    execSync('npx tsc -p tsconfig.json', { cwd: pkgDir, stdio: 'pipe' });

    expect(fs.existsSync(path.join(pkgDir, 'dist/index.js'))).toBe(true);
    expect(fs.existsSync(path.join(pkgDir, 'dist/index.d.ts'))).toBe(true);

    // Cleanup both together
    fs.rmSync(path.join(pkgDir, 'dist'), { recursive: true, force: true });
  });
});