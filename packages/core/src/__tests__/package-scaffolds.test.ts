import { describe, expect, it } from 'vitest';
import fs from 'node:fs';

describe('package scaffolds', () => {
  it('has a CLI package manifest and entry point', () => {
    expect(fs.existsSync('packages/cli/package.json')).toBe(true);
    expect(fs.existsSync('packages/cli/src/main.ts')).toBe(true);
  });

  it('has a UI package manifest with build scripts', () => {
    const pkg = JSON.parse(fs.readFileSync('packages/ui/package.json', 'utf8'));

    expect(pkg.name).toBe('@dev-loop/ui');
    expect(pkg.type).toBe('module');
    expect(pkg.scripts.build).toBeTruthy();
  });

  it('has minimal UI entry points', () => {
    expect(
      fs.existsSync('packages/ui/src/server/index.ts') ||
      fs.existsSync('packages/ui/src/index.ts')
    ).toBe(true);
  });
});
