import { ConfigSchema, type DevLoopConfig } from './schema.js';
import { mergeDefaults } from './merge.js';

export interface EnvOverrideOptions {
  env?: NodeJS.ProcessEnv;
}

const ENV_OVERRIDE_PATHS: Record<string, string[]> = {
  DEV_LOOP_CODING_PRIMARY_PROVIDER: ['coding', 'primary', 'provider'],
  DEV_LOOP_CODING_PRIMARY_MODEL: ['coding', 'primary', 'model'],
  DEV_LOOP_CODING_PRIMARY_MAX_TOKENS: ['coding', 'primary', 'max_tokens'],
  DEV_LOOP_CODING_PRIMARY_TEMPERATURE: ['coding', 'primary', 'temperature'],
  DEV_LOOP_LOOP_MAX_RETRY: ['loop', 'max_retry'],
  DEV_LOOP_NOTIFICATIONS_DESKTOP_ENABLED: ['notifications', 'desktop', 'enabled'],
  DEV_LOOP_UI_PORT: ['ui', 'port'],
  DEV_LOOP_UI_HOST: ['ui', 'host'],
};

export function applyEnvOverrides(config: DevLoopConfig, options: EnvOverrideOptions = {}): DevLoopConfig {
  const env = options.env ?? process.env;
  const overrides: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(env)) {
    if (!key.startsWith('DEV_LOOP_') || value === undefined) continue;
    const parts = ENV_OVERRIDE_PATHS[key];
    if (!parts) continue;

    let obj: Record<string, unknown> = overrides;
    for (let i = 0; i < parts.length - 1; i += 1) {
      if (!obj[parts[i]] || typeof obj[parts[i]] !== 'object') {
        obj[parts[i]] = {};
      }
      obj = obj[parts[i]] as Record<string, unknown>;
    }
    obj[parts[parts.length - 1]] = coerceEnvValue(value);
  }

  if (Object.keys(overrides).length === 0) return config;
  return ConfigSchema.parse(mergeDefaults(config, overrides));
}

function coerceEnvValue(value: string): string | number | boolean {
  if (value === 'true') return true;
  if (value === 'false') return false;
  if (/^-?\d+$/.test(value)) return Number.parseInt(value, 10);
  if (/^-?\d+\.\d+$/.test(value)) return Number.parseFloat(value);
  return value;
}
