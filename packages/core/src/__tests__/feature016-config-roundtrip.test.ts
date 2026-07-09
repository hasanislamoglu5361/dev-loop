// packages/core/src/__tests__/feature016-config-roundtrip.test.ts
// TDD tests for FEATURE016 - Config Load and Save Roundtrip

import { describe, expect, it } from 'vitest';
import * as fsSync from 'node:fs';
import * as fsPromises from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import YAML from 'yaml';
import { createDefaultConfig, loadConfig, saveConfig } from '../config/loader.js';

function tempProjectDirSync(): string {
  return fsSync.mkdtempSync(path.join(os.tmpdir(), 'dev-loop-f016-'));
}

async function tempProjectDir(): Promise<string> {
  const dir = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'dev-loop-f016-'), { encoding: 'utf8' });
  return dir;
}

describe('FEATURE016 - Config Load and Save Roundtrip', () => {
  it('loads defaults when config file is missing in temp directory', async () => {
    const projectDir = await tempProjectDir();
    // No dev-loop.yaml created — should return complete defaults.
    const config = await loadConfig({ projectDir });

    expect(config.loop.max_retry).toBeGreaterThan(0);
    expect(config.notifications.desktop.enabled).toBe(true);
  });

  it('creates default then loads it successfully', async () => {
    const projectDir = await tempProjectDir();
    const configPath = await createDefaultConfig(projectDir);

    // File must exist on disk.
    expect(fsSync.existsSync(configPath)).toBe(true);

    // Re-loaded config must parse without error and contain the values from the default YAML.
    const config = await loadConfig({ projectDir });
    expect(config.coding.primary.provider).toBe('auto');
  });

  it('saves nested update without losing unrelated values', async () => {
    const projectDir = await tempProjectDir();
    await createDefaultConfig(projectDir);

    // Update only one leaf.
    await saveConfig(projectDir, { loop: { max_retry: 42 } });
    const config = await loadConfig({ projectDir });

    expect(config.loop.max_retry).toBe(42);
    // Unrelated fields must survive the roundtrip.
    expect(config.notifications.desktop.enabled).toBe(true);
  });

  it('preserves ${ENV_VAR} placeholders on reload', async () => {
    const projectDir = await tempProjectDir();
    // Write a YAML that contains an env placeholder.
    const yamlContent = `planning:
  primary:
    provider: anthropic
    model: claude-sonnet-4-6
    api_key: \${ANTHROPIC_API_KEY}
`;
    await fsPromises.writeFile(path.join(projectDir, 'dev-loop.yaml'), yamlContent);

    // Reload and verify the placeholder is still literal.
    const config = await loadConfig({ projectDir });
    expect(config.planning.primary.api_key).toBe('${ANTHROPIC_API_KEY}');
  });

  it('saveConfig roundtrip preserves string values', async () => {
    const projectDir = await tempProjectDir();
    await createDefaultConfig(projectDir);

    // Save a non-numeric, non-boolean value to ensure roundtrip fidelity.
    await saveConfig(projectDir, { 'planning.primary.model': 'custom-model-v2' });
    const config = await loadConfig({ projectDir });
    expect(config.planning.primary.model).toBe('custom-model-v2');
  });

  it('writeYamlFile roundtrip preserves JSON-like objects', async () => {
    // Re-use the writer module from loader.ts (re-exported) or directly.
    const { writeYamlFile } = await import('../config/writer.js');
    const dir = tempProjectDirSync();
    try {
      const filePath = path.join(dir, 'test.yaml');
      writeYamlFile(filePath, { key: 'value', nested: { num: 42 } });

      expect(fsSync.existsSync(filePath)).toBe(true);
      // Re-parse to ensure it is valid YAML.
      const raw = fsSync.readFileSync(filePath, 'utf-8');
      const parsed = YAML.parse(raw) as Record<string, unknown>;
      expect(parsed.key).toBe('value');
      expect((parsed.nested as { num: number }).num).toBe(42);
    } finally {
      fsSync.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('idempotent save does not corrupt file', async () => {
    const projectDir = await tempProjectDir();
    await createDefaultConfig(projectDir);

    // Save same value twice in a row.
    await saveConfig(projectDir, { loop: { max_retry: 7 } });
    await saveConfig(projectDir, { loop: { max_retry: 7 } });
    const config = await loadConfig({ projectDir });
    expect(config.loop.max_retry).toBe(7);
  });

  it('save then reload returns same nested structure as original', async () => {
    const projectDir = await tempProjectDir();
    await createDefaultConfig(projectDir);

    // Get the full config first.
    const before = await loadConfig({ projectDir });

    // Re-write the entire config to disk via saveConfig (passing a subset).
    await saveConfig(projectDir, { loop: { max_retry: 99 } });

    const after = await loadConfig({ projectDir });

    expect(after.loop.max_retry).toBe(99);
    expect(after.notifications.desktop.enabled).toBe(before.notifications.desktop.enabled);
    expect(after.coding.primary.provider).toBe(before.coding.primary.provider);
  });
});