import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { runCommand } from './helpers/commands.js';
import { readJsonFile, readPackageJson } from './helpers/package-json.js';
import { fromRoot } from './helpers/repo-paths.js';
import { cleanupTempProject, createTempProject } from './helpers/temp-dir.js';

describe('FEATURE005 - Build Pipeline With Turbo', () => {
  it('turbo.json exists at project root', () => {
    const turboJson = fromRoot('turbo.json');
    expect(fs.existsSync(turboJson)).toBe(true);
    const content = readJsonFile(turboJson);
    expect(content.tasks).toBeDefined();
  });

  it('core package has a build script', () => {
    const core = readPackageJson('core');
    const scripts = (core.scripts ?? {}) as Record<string, string>;
    expect(scripts.build).toBeDefined();
  });

  it('cli package has a build script', () => {
    const cli = readPackageJson('cli');
    const scripts = (cli.scripts ?? {}) as Record<string, string>;
    expect(scripts.build).toBeDefined();
  });

  it('ui package has a build script', () => {
    const ui = readPackageJson('ui');
    const scripts = (ui.scripts ?? {}) as Record<string, string>;
    expect(scripts.build).toBeDefined();
  });

  it('each package tsconfig sets outDir to dist and rootDir to src', () => {
    for (const pkg of ['core', 'cli', 'ui']) {
      const tsconfigPath = fromRoot('packages', pkg, 'tsconfig.json');
      expect(fs.existsSync(tsconfigPath)).toBe(true);
      const tsconfig = readJsonFile(tsconfigPath);
      const compilerOptions = tsconfig.compilerOptions as Record<string, unknown>;
      expect(compilerOptions.outDir).toBe('dist');
      expect(compilerOptions.rootDir).toBe('src');
    }
  });

  it('root tsconfig has declaration and sourceMap enabled', () => {
    const base = readJsonFile(fromRoot('tsconfig.base.json'));
    const compilerOptions = base.compilerOptions as Record<string, unknown>;
    expect(compilerOptions.declaration).toBe(true);
    expect(compilerOptions.sourceMap).toBe(true);
  });

  it('root tsconfig references all three packages', () => {
    const base = readJsonFile(fromRoot('tsconfig.base.json'));
    const paths = (base.references as Array<{ path: string }>).map(r => r.path);
    expect(paths).toContain('./packages/core');
    expect(paths).toContain('./packages/cli');
    expect(paths).toContain('./packages/ui');
  });

  it('build script output directory matches package.json exports', () => {
    const core = readPackageJson('core');
    const cli = readPackageJson('cli');
    // Exports should reference dist/ paths that match outDir
    expect((core.main as string).startsWith('./dist/')).toBe(true);
    expect((cli.main as string).startsWith('./dist/')).toBe(true);
  });

  it('builds a temp package fixture and verifies dist/index.js + dist/index.d.ts exist', () => {
    const temp = createTempProject('dev-loop-build-fixture-');
    try {
      fs.mkdirSync(path.join(temp, 'src'), { recursive: true });
      fs.writeFileSync(path.join(temp, 'src/index.ts'), 'export const ok: boolean = true;\n');
      fs.writeFileSync(path.join(temp, 'tsconfig.json'), JSON.stringify({
        extends: fromRoot('tsconfig.base.json'),
        compilerOptions: {
          rootDir: 'src',
          outDir: 'dist',
          tsBuildInfoFile: 'dist/.tsbuildinfo',
          types: [],
        },
        include: ['src/**/*.ts'],
      }));

      runCommand(fromRoot('node_modules/.bin/tsc'), ['-p', 'tsconfig.json'], { cwd: temp });

      expect(fs.existsSync(path.join(temp, 'dist/index.js'))).toBe(true);
      expect(fs.existsSync(path.join(temp, 'dist/index.d.ts'))).toBe(true);
    } finally {
      cleanupTempProject(temp);
    }
  });

  it('keeps incremental state inside temp fixture output', () => {
    const temp = createTempProject('dev-loop-build-incremental-');
    try {
      fs.mkdirSync(path.join(temp, 'src'), { recursive: true });
      fs.writeFileSync(path.join(temp, 'src/index.ts'), 'export const ok = true;\n');
      fs.writeFileSync(path.join(temp, 'tsconfig.json'), JSON.stringify({
        extends: fromRoot('tsconfig.base.json'),
        compilerOptions: {
          rootDir: 'src',
          outDir: 'dist',
          tsBuildInfoFile: 'dist/.tsbuildinfo',
          types: [],
        },
        include: ['src/**/*.ts'],
      }));

      runCommand(fromRoot('node_modules/.bin/tsc'), ['-p', 'tsconfig.json'], { cwd: temp });

      expect(fs.existsSync(path.join(temp, 'dist/index.js'))).toBe(true);
      expect(fs.existsSync(path.join(temp, 'dist/index.d.ts'))).toBe(true);
      expect(fs.existsSync(path.join(temp, 'dist/.tsbuildinfo'))).toBe(true);
    } finally {
      cleanupTempProject(temp);
    }
  });

  it('repairs missing emitted runtime files on rebuild', () => {
    runCommand('npm', ['run', 'build', '--', '--force']);

    const emittedFiles = [
      fromRoot('packages/core/dist/errors.js'),
      fromRoot('packages/core/dist/errors.d.ts'),
      fromRoot('packages/core/dist/errors.js.map'),
      fromRoot('packages/core/dist/errors.d.ts.map'),
    ];

    for (const emittedFile of emittedFiles) {
      fs.rmSync(emittedFile, { force: true });
      expect(fs.existsSync(emittedFile)).toBe(false);
    }

    runCommand('npm', ['run', 'build', '--', '--force']);

    expect(fs.existsSync(fromRoot('packages/core/dist/errors.js'))).toBe(true);
    runCommand('node', [
      '-e',
      "await import('./packages/core/dist/index.js'); await import('./packages/core/dist/db/index.js'); console.log('core dist imports ok')",
    ]);
  });
});
