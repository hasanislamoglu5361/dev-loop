import { describe, expect, it } from 'vitest';
import { readPackageJson } from './helpers/package-json.js';

describe('@dev-loop/cli import safety', () => {
  it('imports CLI public API without parsing argv', async () => {
    const originalArgv = process.argv;
    process.argv = ['node', 'dev-loop', '--definitely-not-a-real-option'];

    try {
      const modulePath = '../../../cli/src/index.js';
      const mod = await import(modulePath) as { createCli?: unknown };
      expect(typeof mod.createCli).toBe('function');
    } finally {
      process.argv = originalArgv;
    }
  });

  it('package export points to import-safe index output', () => {
    const pkg = readPackageJson('cli');

    expect(pkg.main).toBe('./dist/index.js');
    expect(pkg.types).toBe('./dist/index.d.ts');
    expect(pkg.bin).toEqual({ 'dev-loop': './dist/main.js' });
    expect(pkg.exports).toEqual({
      '.': {
        types: './dist/index.d.ts',
        import: './dist/index.js',
      },
    });
  });
});
