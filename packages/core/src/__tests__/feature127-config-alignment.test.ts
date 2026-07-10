import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { CONFIG_SECTION_CONSUMERS } from '../config/consumers.js';
import { DEFAULT_CONFIG } from '../config/defaults.js';
import { applyEnvOverrides, saveConfig } from '../config/loader.js';
import { writeYamlFile } from '../config/writer.js';

const dirs: string[] = [];
afterEach(() => dirs.splice(0).forEach(dir => rmSync(dir, { recursive: true, force: true })));

describe('FEATURE127 configuration alignment', () => {
  it('declares at least one production consumer for every schema section', () => {
    expect(Object.keys(CONFIG_SECTION_CONSUMERS).sort()).toEqual(Object.keys(DEFAULT_CONFIG).sort());
    expect(Object.values(CONFIG_SECTION_CONSUMERS).every(consumers => consumers.length > 0)).toBe(true);
  });

  it('preserves false, zero, and empty environment values', () => {
    const config = applyEnvOverrides(DEFAULT_CONFIG, { env: {
      DEV_LOOP_NOTIFICATIONS_DESKTOP_ENABLED: 'false',
      DEV_LOOP_CODING_PRIMARY_TEMPERATURE: '0',
      DEV_LOOP_UI_HOST: '',
    } });
    expect(config.notifications.desktop.enabled).toBe(false);
    expect(config.coding.primary.temperature).toBe(0);
    expect(config.ui.host).toBe('');
  });

  it('validates updates before replacing the existing config', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'dev-loop-config-')); dirs.push(dir);
    const file = path.join(dir, 'dev-loop.yaml');
    writeYamlFile(file, DEFAULT_CONFIG);
    const before = readFileSync(file, 'utf8');
    await expect(saveConfig(dir, { 'ui.port': -1 })).rejects.toThrow();
    expect(readFileSync(file, 'utf8')).toBe(before);
  });

  it('atomically replaces config without leaving temporary files', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'dev-loop-config-')); dirs.push(dir);
    const file = path.join(dir, 'dev-loop.yaml');
    writeFileSync(file, 'old: true\n');
    writeYamlFile(file, { version: '1' });
    expect(readFileSync(file, 'utf8')).toBe('version: "1"\n');
    expect(existsSync(file)).toBe(true);
    expect(readdirSync(dir)).toEqual(['dev-loop.yaml']);
  });
});
