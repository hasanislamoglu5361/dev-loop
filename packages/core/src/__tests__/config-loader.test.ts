import { afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { DEFAULT_CONFIG } from '../config/defaults.js';
import {
  applyEnvOverrides,
  createDefaultConfig,
  type ConfigWarning,
  loadConfig,
  mergeDefaults,
  saveConfig,
} from '../config/loader.js';

async function tempProjectDir(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), 'dev-loop-config-'));
}

const originalEnv = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnv };
});

describe('config loader', () => {
  it('loads nested YAML objects correctly', async () => {
    const projectDir = await tempProjectDir();
    await fs.writeFile(
      path.join(projectDir, 'dev-loop.yaml'),
      `
coding:
  primary:
    provider: openrouter
    model: deepseek/deepseek-r1
`
    );

    const config = await loadConfig(projectDir);

    expect(config.coding.primary.provider).toBe('openrouter');
    expect(config.coding.primary.model).toBe('deepseek/deepseek-r1');
    expect(config.coding.primary.max_tokens).toBe(16384);
  });

  it('merges nested overrides into defaults', () => {
    const merged = mergeDefaults(DEFAULT_CONFIG, {
      loop: { max_retry: 3 },
      coding: { primary: { model: 'custom-model' } },
    });

    expect(merged.loop.max_retry).toBe(3);
    expect(merged.coding.primary.model).toBe('custom-model');
    expect(merged.loop.diff_aware).toBe(true);
  });

  it('maps underscore env overrides to schema keys', () => {
    process.env.DEV_LOOP_CODING_PRIMARY_MAX_TOKENS = '4096';

    const config = applyEnvOverrides(DEFAULT_CONFIG);

    expect(config.coding.primary.max_tokens).toBe(4096);
  });

  it('saves nested config updates and reloads them', async () => {
    const projectDir = await tempProjectDir();
    await createDefaultConfig(projectDir);

    await saveConfig(projectDir, { loop: { max_retry: 2 } });
    const config = await loadConfig(projectDir);

    expect(config.loop.max_retry).toBe(2);
    expect(config.loop.diff_aware).toBe(true);
  });

  it('throws on invalid YAML by default when using options API', async () => {
    const projectDir = await tempProjectDir();
    const configPath = path.join(projectDir, 'dev-loop.yaml');
    await fs.writeFile(configPath, 'coding:\n  primary: [');

    await expect(loadConfig({ projectDir })).rejects.toThrow(/Invalid dev-loop.yaml syntax/);
  });

  it('can intentionally warn and default for compatibility mode', async () => {
    const projectDir = await tempProjectDir();
    const warnings: ConfigWarning[] = [];
    await fs.writeFile(
      path.join(projectDir, 'dev-loop.yaml'),
      `
loop:
  max_retry: "not-a-number"
`
    );

    const config = await loadConfig({
      projectDir,
      invalidConfig: 'warn-and-default',
      onWarning: warning => warnings.push(warning),
    });

    expect(config.loop.max_retry).toBe(DEFAULT_CONFIG.loop.max_retry);
    expect(warnings[0]?.code).toBe('config.validation.failed');
  });

  it('applies env overrides using an injected env object', () => {
    const config = applyEnvOverrides(DEFAULT_CONFIG, {
      env: {
        DEV_LOOP_UI_PORT: '9999',
        DEV_LOOP_NOTIFICATIONS_DESKTOP_ENABLED: 'false',
      },
    });

    expect(config.ui.port).toBe(9999);
    expect(config.notifications.desktop.enabled).toBe(false);
  });
});
