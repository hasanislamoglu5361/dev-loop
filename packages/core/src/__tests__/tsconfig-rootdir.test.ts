import { describe, expect, it } from 'vitest';
import fs from 'node:fs';

describe('typescript monorepo config', () => {
  it('does not force all packages under root src', () => {
    const tsconfig = JSON.parse(fs.readFileSync('tsconfig.base.json', 'utf8'));
    expect(tsconfig.compilerOptions?.rootDir).not.toBe('./src');
  });

  it('uses solution-style project references for monorepo', () => {
    const tsconfig = fs.readFileSync('tsconfig.base.json', 'utf8');
    // A solution tsconfig has "files": [] or uses projectReferences
    expect(tsconfig).toContain('"files"');
    expect(tsconfig).toContain('"references"');
  });
});