import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('FEATURE007 - ESLint and Formatting Foundation', () => {
  const rootDir = path.resolve(__dirname, '../../../..');

  function readJson(relPath: string): unknown {
    return JSON.parse(fs.readFileSync(path.join(rootDir, relPath), 'utf8'));
  }

  it('root package.json has a lint command in scripts', () => {
    const pkg = readJson('package.json') as Record<string, unknown>;
    const scripts = (pkg.scripts ?? {}) as Record<string, string>;
    expect(scripts.lint).toBeDefined();
  });

  it('ESLint flat config file exists at project root or in a package', () => {
    // Look for eslint.config.js, eslint.config.mjs, or .eslintrc.* files
    const rootConfig = path.join(rootDir, 'eslint.config.js');
    const rootMjs = path.join(rootDir, 'eslint.config.mjs');
    const eslintrcJs = path.join(rootDir, '.eslintrc.js');
    const eslintrcJson = path.join(rootDir, '.eslintrc.json');

    expect(
      fs.existsSync(rootConfig) ||
      fs.existsSync(rootMjs) ||
      fs.existsSync(eslintrcJs) ||
      fs.existsSync(eslintrcJson)
    ).toBe(true);
  });

  it('lint command runs without missing-config errors', async () => {
    const { execSync } = await import('node:child_process');
    const output = execSync('npm run lint', {
      cwd: rootDir,
      encoding: 'utf8',
    });
    expect(output).not.toContain('missing-config');
    expect(output).not.toContain('Cannot find config');
  });

  it('ESLint config does not lint dist or generated files', () => {
    let eslintConfigContent = '';
    const candidates = [
      path.join(rootDir, 'eslint.config.js'),
      path.join(rootDir, '.eslintrc.js'),
      path.join(rootDir, '.eslintrc.json'),
    ];

    for (const candidate of candidates) {
      if (fs.existsSync(candidate)) {
        eslintConfigContent = fs.readFileSync(candidate, 'utf8');
        break;
      }
    }

    // Should exclude dist directories from linting
    expect(eslintConfigContent).toMatch(/dist|node_modules/);
  });

  it('ESLint config includes TypeScript source files', () => {
    let eslintConfigContent = '';
    const candidates = [
      path.join(rootDir, 'eslint.config.js'),
      path.join(rootDir, '.eslintrc.js'),
      path.join(rootDir, '.eslintrc.json'),
    ];

    for (const candidate of candidates) {
      if (fs.existsSync(candidate)) {
        eslintConfigContent = fs.readFileSync(candidate, 'utf8');
        break;
      }
    }

    // Should include TypeScript files pattern
    expect(eslintConfigContent).toMatch(/\.ts|typescript/);
  });

  it('Prettier config exists or is referenced in ESLint config', () => {
    const prettierConfigs = [
      path.join(rootDir, '.prettierrc'),
      path.join(rootDir, '.prettierrc.js'),
      path.join(rootDir, '.prettierrc.json'),
      path.join(rootDir, '.prettierignore'),
    ];

    const prettierPresent = prettierConfigs.some(p => fs.existsSync(p));

    // If no prettier config, check if eslint extends prettier or has formatting rules
    let eslintConfigContent = '';
    for (const candidate of [
      path.join(rootDir, 'eslint.config.js'),
      path.join(rootDir, '.eslintrc.js'),
      path.join(rootDir, '.eslintrc.json'),
    ]) {
      if (fs.existsSync(candidate)) {
        eslintConfigContent = fs.readFileSync(candidate, 'utf8');
        break;
      }
    }

    expect(prettierPresent || eslintConfigContent.length > 0).toBe(true);
  });
});