import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('FEATURE006 - Vitest Baseline and No-Tests Failure Fix', () => {
  const rootDir = path.resolve(__dirname, '../../../..');

  function readJson(relPath: string): unknown {
    return JSON.parse(fs.readFileSync(path.join(rootDir, relPath), 'utf8'));
  }

  // ---- Red phase: prove the test foundation exists and works ----

  it('root package.json has a test script that uses vitest', () => {
    const root = readJson('package.json') as Record<string, unknown>;
    const scripts = (root.scripts ?? {}) as Record<string, string>;
    expect(scripts.test).toBeDefined();
    expect(scripts.test).toContain('vitest');
  });

  it('vitest.config.ts exists at project root', () => {
    const configPath = path.join(rootDir, 'vitest.config.ts');
    expect(fs.existsSync(configPath)).toBe(true);
    const content = fs.readFileSync(configPath, 'utf8');
    // Must import from vitest/config (ESM spec requires explicit extension)
    expect(content).toMatch(/from ['"]vitest\/config['"]/);
  });

  it('vitest config excludes dist and node_modules', () => {
    const raw = fs.readFileSync(path.join(rootDir, 'vitest.config.ts'), 'utf8');
    expect(raw).toContain('**/node_modules/**');
    expect(raw).toContain('**/dist/**');
  });

  it('vitest config include covers packages/*/src/**/*.ts test files', () => {
    const raw = fs.readFileSync(path.join(rootDir, 'vitest.config.ts'), 'utf8');
    expect(raw).toMatch(/packages\/\*\/src\/\*\*\/\*\.\w+/);
  });

  it('core package has at least one test file', () => {
    const coreTests = path.join(rootDir, 'packages/core/src/__tests__');
    const files = fs.existsSync(coreTests) ? fs.readdirSync(coreTests).filter(f => f.endsWith('.test.ts')) : [];
    expect(files.length).toBeGreaterThan(0);
  });

  it('root package.json devDependencies includes vitest', () => {
    const root = readJson('package.json') as Record<string, unknown>;
    const deps: Record<string, string> = (root.devDependencies ?? {}) as Record<string, string>;
    expect(deps.vitest).toBeDefined();
  });
});