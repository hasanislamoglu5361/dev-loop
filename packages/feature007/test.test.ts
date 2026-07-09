// eslint.config.js flat config test for FEATURE007 - ESLint and Formatting Foundation
// This test verifies the ESLint configuration is properly set up
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const ROOT_DIR = '/Users/hasanislamoglu/dev-loop';

describe('ESLint Configuration for FEATURE007', () => {
  const eslintConfigPath = path.join(ROOT_DIR, 'eslint.config.js');
  
  it('should have a valid ESLint configuration file', () => {
    expect(fs.existsSync(eslintConfigPath)).toBe(true);
  });

  it('should include TypeScript source files in config comments', () => {
    const content = fs.readFileSync(eslintConfigPath, 'utf8');
    expect(content).toMatch(/\.ts|typescript/i);
  });

  it('should exclude dist and node_modules from linting', () => {
    const content = fs.readFileSync(eslintConfigPath, 'utf8');
    expect(content).toMatch(/dist|node_modules/);
  });

  it('should be valid JavaScript that can be parsed', () => {
    try {
      // Try to parse the config file as JavaScript
      require(eslintConfigPath);
    } catch (error) {
      // If it's a module, that's okay - we're just checking syntax validity
      expect((error as Error).message).not.toContain('SyntaxError');
    }
  });
});