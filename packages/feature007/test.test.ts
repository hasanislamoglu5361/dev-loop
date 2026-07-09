// eslint.config.js flat config test for FEATURE007 - ESLint and Formatting Foundation
// This test verifies the ESLint configuration is properly set up
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const ROOT_DIR = process.cwd();

describe('ESLint Configuration for FEATURE007', () => {
  const eslintConfigPath = path.join(ROOT_DIR, 'eslint.config.js');
  
  it('should have a valid ESLint configuration file', () => {
    expect(fs.existsSync(eslintConfigPath)).toBe(true);
  });

  it('should run the root lint command without missing-config errors', () => {
    const output = execFileSync('npm', ['run', 'lint'], {
      cwd: ROOT_DIR,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    expect(output).not.toContain('missing-config');
    expect(output).not.toContain('Cannot find config');
  });
});
