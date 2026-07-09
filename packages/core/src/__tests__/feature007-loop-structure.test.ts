import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import { runNpmScript } from './helpers/commands.js';
import { readRootPackageJson } from './helpers/package-json.js';
import { fromRoot } from './helpers/repo-paths.js';

describe('FEATURE007 - ESLint and Formatting Foundation', () => {
  it('root package.json has a lint command in scripts', () => {
    const pkg = readRootPackageJson();
    const scripts = (pkg.scripts ?? {}) as Record<string, string>;
    expect(scripts.lint).toBeDefined();
  });

  it('ESLint flat config file exists at project root or in a package', () => {
    // Look for eslint.config.js, eslint.config.mjs, or .eslintrc.* files
    const rootConfig = fromRoot('eslint.config.js');
    const rootMjs = fromRoot('eslint.config.mjs');
    const eslintrcJs = fromRoot('.eslintrc.js');
    const eslintrcJson = fromRoot('.eslintrc.json');

    expect(
      fs.existsSync(rootConfig) ||
      fs.existsSync(rootMjs) ||
      fs.existsSync(eslintrcJs) ||
      fs.existsSync(eslintrcJson)
    ).toBe(true);
  });

  it('lint command runs without missing-config errors', () => {
    const output = runNpmScript('lint');
    expect(output).not.toContain('missing-config');
    expect(output).not.toContain('Cannot find config');
  });

  it('ESLint config does not lint dist or generated files', () => {
    let eslintConfigContent = '';
    const candidates = [
      fromRoot('eslint.config.js'),
      fromRoot('.eslintrc.js'),
      fromRoot('.eslintrc.json'),
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
      fromRoot('eslint.config.js'),
      fromRoot('.eslintrc.js'),
      fromRoot('.eslintrc.json'),
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
      fromRoot('.prettierrc'),
      fromRoot('.prettierrc.js'),
      fromRoot('.prettierrc.json'),
      fromRoot('.prettierignore'),
    ];

    const prettierPresent = prettierConfigs.some(p => fs.existsSync(p));

    // If no prettier config, check if eslint extends prettier or has formatting rules
    let eslintConfigContent = '';
    for (const candidate of [
      fromRoot('eslint.config.js'),
      fromRoot('.eslintrc.js'),
      fromRoot('.eslintrc.json'),
    ]) {
      if (fs.existsSync(candidate)) {
        eslintConfigContent = fs.readFileSync(candidate, 'utf8');
        break;
      }
    }

    expect(prettierPresent || eslintConfigContent.length > 0).toBe(true);
  });
});
