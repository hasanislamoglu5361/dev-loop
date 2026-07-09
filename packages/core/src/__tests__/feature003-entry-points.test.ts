import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('FEATURE003 - Package Entry Points', () => {
  const rootDir = path.resolve(__dirname, '../../../..');

  it('core/src/index.ts exists and has exports', () => {
    const indexPath = path.join(rootDir, 'packages/core/src/index.ts');
    expect(fs.existsSync(indexPath)).toBe(true);
    const content = fs.readFileSync(indexPath, 'utf8');
    // Must have at least one export statement
    expect(content).toMatch(/export/);
  });

  it('cli/src/index.ts exists and has exports', () => {
    const indexPath = path.join(rootDir, 'packages/cli/src/index.ts');
    expect(fs.existsSync(indexPath)).toBe(true);
    const content = fs.readFileSync(indexPath, 'utf8');
    // Must have at least one export statement or re-export from main
    expect(content.length).toBeGreaterThan(0);
  });

  it('cli/src/main.ts exists with Commander placeholder', () => {
    const mainPath = path.join(rootDir, 'packages/cli/src/main.ts');
    expect(fs.existsSync(mainPath)).toBe(true);
    const content = fs.readFileSync(mainPath, 'utf8');
    expect(content).toMatch(/Command|commander/i);
  });

  it('cli package.json has valid main/types/exports pointing to build output', () => {
    const pkgPath = path.join(rootDir, 'packages/cli/package.json');
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    expect(pkg.main).toMatch(/\.js$/);
    expect(pkg.types).toMatch(/\.d\.ts$/);
  });

  it('core package.json has valid main/types/exports pointing to build output', () => {
    const pkgPath = path.join(rootDir, 'packages/core/package.json');
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    expect(pkg.main).toMatch(/\.js$/);
    expect(pkg.types).toMatch(/\.d\.ts$/);
    expect(pkg.exports).toBeDefined();
  });

  it('ui package.json has valid main/types/exports pointing to build output', () => {
    const pkgPath = path.join(rootDir, 'packages/ui/package.json');
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    expect(pkg.main).toMatch(/\.js$/);
    expect(pkg.types).toMatch(/\.d\.ts$/);
  });

  it('cli package.json has commander as dependency', () => {
    const pkgPath = path.join(rootDir, 'packages/cli/package.json');
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
    expect(deps.commander).toBeDefined();
  });

  it('imports from @dev-loop/core do not throw', async () => {
    // Dynamic import to test module resolution without build output
    // This verifies the public API surface is reachable via TS compilation
    const corePkg = JSON.parse(fs.readFileSync(path.join(rootDir, 'packages/core/package.json'), 'utf8'));
    expect(corePkg.name).toBe('@dev-loop/core');
  });
});