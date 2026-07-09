import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('FEATURE004 - CLI and UI Package Manifests', () => {
  const rootDir = path.resolve(__dirname, '../../../..');

  function readPkg(pkgRelPath: string): Record<string, unknown> {
    return JSON.parse(fs.readFileSync(path.join(rootDir, pkgRelPath), 'utf8'));
  }

  // ---- Red phase: prove requirements are NOT yet met ----

  it('CLI package.json has typecheck and test scripts', () => {
    const cli = readPkg('packages/cli/package.json');
    const scripts = (cli.scripts ?? {}) as Record<string, string>;
    expect(scripts.typecheck).toBeDefined();
    expect(scripts.test).toBeDefined();
  });

  it('CLI package.json bin field points to dist/main.js', () => {
    const cli = readPkg('packages/cli/package.json');
    const bin = (cli.bin ?? {}) as Record<string, string>;
    expect(bin['dev-loop']).toBe('./dist/main.js');
  });

  it('@dev-loop/cli depends on @dev-loop/core', () => {
    const cli = readPkg('packages/cli/package.json');
    const deps: Record<string, string> = (cli.dependencies ?? {}) as Record<string, string>;
    expect(deps['@dev-loop/core']).toBeDefined();
  });

  it('CLI package does not declare UI-only dependencies (fastify)', () => {
    const cli = readPkg('packages/cli/package.json');
    const allDeps: Record<string, string> = {
      ...((cli.dependencies ?? {}) as Record<string, string>),
      ...((cli.devDependencies ?? {}) as Record<string, string>),
    };
    expect(allDeps.fastify).toBeUndefined();
  });

  it('UI package.json has build, typecheck, and test scripts', () => {
    const ui = readPkg('packages/ui/package.json');
    const scripts = (ui.scripts ?? {}) as Record<string, string>;
    expect(scripts.build).toBeDefined();
    expect(scripts.typecheck).toBeDefined();
    expect(scripts.test).toBeDefined();
  });

  it('UI package has a valid main/types/exports map', () => {
    const ui = readPkg('packages/ui/package.json');
    expect(ui.main).toMatch(/\.js$/);
    expect((ui.types ?? '').toString()).toMatch(/\.d\.ts$/);
    expect((ui.exports as Record<string, unknown>)?.['.']).toBeDefined();
  });

  it('CLI and UI package.json files are syntactically valid JSON', () => {
    const cliRaw = fs.readFileSync(path.join(rootDir, 'packages/cli/package.json'), 'utf8');
    const uiRaw = fs.readFileSync(path.join(rootDir, 'packages/ui/package.json'), 'utf8');
    expect(() => JSON.parse(cliRaw)).not.toThrow();
    expect(() => JSON.parse(uiRaw)).not.toThrow();
  });

  it('root package.json workspace list includes both cli and ui', () => {
    const root = readPkg('package.json');
    const ws = (root.workspaces ?? []) as string[];
    expect(ws).toContain('packages/cli');
    expect(ws).toContain('packages/ui');
  });
});