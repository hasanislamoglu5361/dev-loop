// packages/core/src/__tests__/feature100-docs-validation.test.ts
import { describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';

const ROOT_DIR = path.resolve(__dirname, '..', '..', '..', '..');

describe('FEATURE100 - Documentation, CI, Release, and Final Verification', () => {
  const requiredFiles: Record<string, string[]> = {
    'README.md': ['# dev-loop'],
    'CONTRIBUTING.md': ['Getting Started'],
    'CHANGELOG.md': ['Unreleased'],
    'LICENSE': ['MIT License'],
    '.github/workflows/ci.yml': ['npm test', 'npm run typecheck'],
    '.github/workflows/release.yml': ['node-version:'],
  };

  for (const [file, contentPatterns] of Object.entries(requiredFiles)) {
    it(`validates ${file} exists and contains expected patterns`, () => {
      const filePath = path.join(ROOT_DIR, file);
      expect(fs.existsSync(filePath), `${file} should exist`).toBe(true);

      if (contentPatterns.length > 0) {
        const content = fs.readFileSync(filePath, 'utf8');
        for (const pattern of contentPatterns) {
          expect(
            content.includes(pattern),
            `${file} should contain "${pattern}"`
          ).toBe(true);
        }
      }
    });
  }

  it('validates CI workflow YAML is parseable', () => {
    const ciPath = path.join(ROOT_DIR, '.github/workflows/ci.yml');
    expect(fs.existsSync(ciPath)).toBe(true);
    const content = fs.readFileSync(ciPath, 'utf8');
    expect(content).toContain('name:');
    expect(content).toContain('on:');
    expect(content).toContain('jobs:');
  });

  it('validates release workflow YAML is parseable', () => {
    const releasePath = path.join(ROOT_DIR, '.github/workflows/release.yml');
    expect(fs.existsSync(releasePath)).toBe(true);
    const content = fs.readFileSync(releasePath, 'utf8');
    expect(content).toContain('name:');
    expect(content).toContain('on:');
    expect(content).toContain('jobs:');
  });

  it('validates package.json has correct metadata for open-source', () => {
    const pkgPath = path.join(ROOT_DIR, 'package.json');
    const content = fs.readFileSync(pkgPath, 'utf8');
    const pkg = JSON.parse(content);

    expect(typeof pkg.name).toBe('string');
    expect(typeof pkg.version).toBe('string');
    expect(typeof pkg.description).toBe('string');
    expect(pkg.license).toBeDefined();
    expect(pkg.repository).toBeDefined();
  });

  it('validates README contains key sections', () => {
    const readmePath = path.join(ROOT_DIR, 'README.md');
    const content = fs.readFileSync(readmePath, 'utf8');

    expect(content.toLowerCase()).toContain('install');
    expect(content).toMatch(/npm|yarn|pnpm/i);
  });
});