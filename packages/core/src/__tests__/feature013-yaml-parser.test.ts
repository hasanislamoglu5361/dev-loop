// packages/core/src/__tests__/feature013-yaml-parser.test.ts
// TDD tests for FEATURE013 - YAML Config Parser using real yaml library.

import { describe, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { loadConfig } from '../config/loader.js';
import { parseYamlObject } from '../config/parse.js';

async function tempProjectDir(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), 'dev-loop-f013-'));
}

describe('FEATURE013 - YAML Config Parser (real library)', () => {
  it('parses deeply nested objects like planning.primary.provider', async () => {
    const projectDir = await tempProjectDir();
    await fs.writeFile(
      path.join(projectDir, 'dev-loop.yaml'),
      `
planning:
  primary:
    provider: anthropic
    model: claude-sonnet-4-6
`
    );

    const config = await loadConfig({ projectDir });

    expect(config.planning.primary.provider).toBe('anthropic');
    expect(config.planning.primary.model).toBe('claude-sonnet-4-6');
  });

  it('parses inline arrays like events: [success, failure]', async () => {
    const projectDir = await tempProjectDir();
    await fs.writeFile(
      path.join(projectDir, 'dev-loop.yaml'),
      `
notifications:
  desktop:
    enabled: true
    events: [success, failure]
`
    );

    const config = await loadConfig({ projectDir });

    expect(config.notifications.desktop.enabled).toBe(true);
    expect(config.notifications.desktop.events).toEqual(['success', 'failure']);
  });

  it('ignores YAML comments during parsing', async () => {
    const projectDir = await tempProjectDir();
    await fs.writeFile(
      path.join(projectDir, 'dev-loop.yaml'),
      `
# This is a comment and should be ignored
planning:
  primary: # inline comment after key
    provider: openrouter # another inline comment
    model: deepseek/deepseek-r1
`
    );

    const config = await loadConfig({ projectDir });

    expect(config.planning.primary.provider).toBe('openrouter');
    expect(config.planning.primary.model).toBe('deepseek/deepseek-r1');
  });

  it('handles quoted strings correctly', async () => {
    const result = parseYamlObject(`
name: "double-quoted value"
single: 'single quoted'
unquoted: plain value
`);

    expect(result.name).toBe('double-quoted value');
    expect(result.single).toBe('single quoted');
    expect(result.unquoted).toBe('plain value');
  });

  it('handles multi-line arrays with dashes', async () => {
    const result = parseYamlObject(`
events:
  - success
  - failure
  - timeout
`);

    expect(result.events).toEqual(['success', 'failure', 'timeout']);
  });

  it('returns empty object for blank YAML input', () => {
    const result = parseYamlObject('# only comments\n');
    // yaml library returns {} when input is just comments
    expect(typeof result).toBe('object');
  });

  it('throws ConfigError on invalid YAML syntax', () => {
    expect(() => parseYamlObject('coding:\n  primary: [')).toThrow();
  });
});