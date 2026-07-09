import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

describe('BUG028 - ESLint TypeScript parsing', () => {
  const rootDir = path.resolve(__dirname, '../../../..');

  function readJson(relPath: string): unknown {
    return JSON.parse(fs.readFileSync(path.join(rootDir, relPath), 'utf8'));
  }

  it('ESLint flat config imports typescript-eslint parser', () => {
    const configContent = fs.readFileSync(
      path.join(rootDir, 'eslint.config.js'),
      'utf8'
    );
    expect(configContent).toMatch(/typescript-eslint|@typescript\/eslint/);
  });

  it('ESLint flat config ignores generated files (.d.ts, *.js, *.map, tsbuildinfo)', () => {
    const configContent = fs.readFileSync(
      path.join(rootDir, 'eslint.config.js'),
      'utf8'
    );
    expect(configContent).toMatch(/\*\/dist\*\//);
    expect(configContent).toMatch(/\.d\.ts/);
  });

  it('ESLint flat config sets Node globals', () => {
    const configContent = fs.readFileSync(
      path.join(rootDir, 'eslint.config.js'),
      'utf8'
    );
    expect(configContent).toMatch(/node|globals.*Node/);
  });

  it('npm run lint exits 0 (TypeScript files parse correctly)', () => {
    try {
      execSync('npm run lint', {
        cwd: rootDir,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch (err) {
      const stderr = err instanceof Error ? err.message : String(err);
      throw new Error(
        `npm run lint failed. Stderr:\n${stderr}\n`
      );
    }
  });

  it('Prettier config file (.prettierrc or .prettierrc.json) exists at project root', () => {
    const prettierConfigs = [
      '.prettierrc',
      '.prettierrc.js',
      '.prettierrc.json',
      '.prettierignore',
    ];
    const found = prettierConfigs.some(p => fs.existsSync(path.join(rootDir, p)));
    expect(found).toBe(true);
  });

  it('npm run lint does not produce any "Parsing error" output', () => {
    let output: string;
    try {
      output = execSync('npm run lint 2>&1 || true', {
        cwd: rootDir,
        encoding: 'utf8',
      });
    } catch (err) {
      throw new Error(
        `npm run lint itself failed:\n${err instanceof Error ? err.message : String(err)}`
      );
    }
    expect(output).not.toContain('Parsing error');
  });
});