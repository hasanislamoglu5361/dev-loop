import { describe, expect, it } from 'vitest';
import fs from 'node:fs';

describe('root package metadata', () => {
  it('declares package manager metadata required by turbo', () => {
    const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
    expect(pkg.packageManager ?? pkg.devEngines?.packageManager).toBeTruthy();
    expect(pkg.workspaces).toEqual(expect.arrayContaining(['packages/cli', 'packages/core', 'packages/ui']));
  });
});