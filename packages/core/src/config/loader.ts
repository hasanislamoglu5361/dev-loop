// packages/core/src/config/loader.ts
// YAML config file loader with ${ENV_VAR} interpolation

import * as fs from 'node:fs';
import * as path from 'node:path';
import YAML from 'yaml';
import { ConfigSchema, type DevLoopConfig } from './schema.js';

/** Interpolate ${ENV_VAR} references in a string value */
export function interpolateEnv(value: string): string {
  return value.replace(/\$\{(\w+)\}/g, (_match, envVar) => {
    const envValue = process.env[envVar];
    if (envValue === undefined || envValue === '') {
      console.warn(`⚠️ dev-loop: Environment variable ${envVar} is not set`);
      return value; // Keep original if env var missing
    }
    return envValue;
  });
}

/** Recursively interpolate environment variables in all string values of an object */
function deepInterpolate(obj: unknown): unknown {
  if (typeof obj === 'string') {
    return interpolateEnv(obj);
  }
  if (Array.isArray(obj)) {
    return obj.map(item => deepInterpolate(item));
  }
  if (obj !== null && typeof obj === 'object' && !(obj instanceof Date)) {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      // Skip DEV_LOOP_ prefixed env vars in the YAML itself
      if (key.startsWith('DEV_LOOP_')) continue;
      result[key] = deepInterpolate(value);
    }
    return result;
  }
  return obj;
}

function parseYamlConfig(rawContent: string): Record<string, unknown> {
  try {
    const parsed = YAML.parse(rawContent) ?? {};
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('dev-loop.yaml must contain a YAML object at the top level.');
    }
    return parsed as Record<string, unknown>;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Invalid dev-loop.yaml: ${message}`);
  }
}

/** Load and validate dev-loop.yaml configuration from the given directory */
export async function loadConfig(
  projectDir: string = process.cwd(),
  configPath?: string,
): Promise<DevLoopConfig> {
  const filePath = configPath || path.join(projectDir, 'dev-loop.yaml');

  if (!fs.existsSync(filePath)) {
    // Return defaults if no config file exists yet
    return ConfigSchema.parse({});
  }

  const rawContent = fs.readFileSync(filePath, 'utf-8');

  const parsed = parseYamlConfig(rawContent);
  const interpolated = deepInterpolate(parsed) as Record<string, unknown>;

  try {
    const merged = mergeDefaults(ConfigSchema.parse({}), interpolated);
    const validated = ConfigSchema.safeParse(merged);
    if (validated.success) {
      return validated.data;
    }

    console.warn('⚠️ dev-loop: Config validation warnings:', JSON.stringify(validated.error.errors, null, 2));
    // Return merged defaults with any valid fields
    const fallback = ConfigSchema.parse({});
    return mergeDefaults(fallback, interpolated as Record<string, unknown>);
  } catch (err) {
    console.warn('⚠️ dev-loop: Failed to parse config file:', err);
    return ConfigSchema.parse({});
  }
}

/** Load DEV_LOOP_ env variable overrides and apply them to config */
export function applyEnvOverrides(config: DevLoopConfig): DevLoopConfig {
  const overrides: Record<string, unknown> = {};

  const envOverridePaths: Record<string, string[]> = {
    DEV_LOOP_CODING_PRIMARY_PROVIDER: ['coding', 'primary', 'provider'],
    DEV_LOOP_CODING_PRIMARY_MODEL: ['coding', 'primary', 'model'],
    DEV_LOOP_CODING_PRIMARY_MAX_TOKENS: ['coding', 'primary', 'max_tokens'],
    DEV_LOOP_CODING_PRIMARY_TEMPERATURE: ['coding', 'primary', 'temperature'],
    DEV_LOOP_LOOP_MAX_RETRY: ['loop', 'max_retry'],
    DEV_LOOP_NOTIFICATIONS_DESKTOP_ENABLED: ['notifications', 'desktop', 'enabled'],
    DEV_LOOP_UI_PORT: ['ui', 'port'],
    DEV_LOOP_UI_HOST: ['ui', 'host'],
  };

  for (const [key, value] of Object.entries(process.env)) {
    if (!key.startsWith('DEV_LOOP_') || value === undefined) continue;
    const parts = envOverridePaths[key];
    if (!parts) continue;

    let obj: Record<string, unknown> = overrides;
    for (let i = 0; i < parts.length - 1; i++) {
      if (!obj[parts[i]] || typeof obj[parts[i]] !== 'object') {
        obj[parts[i]] = {};
      }
      obj = obj[parts[i]] as Record<string, unknown>;
    }
    obj[parts[parts.length - 1]] = coerceEnvValue(value);
  }

  if (Object.keys(overrides).length > 0) {
    const merged = mergeDefaults(config, overrides);
    return ConfigSchema.parse(merged);
  }

  return config;
}

/** Merge user config values on top of defaults */
export function mergeDefaults<T>(defaults: T, overrides: unknown): T {
  if (!isPlainObject(overrides)) {
    return overrides === undefined || overrides === null ? defaults : overrides as T;
  }

  const result: Record<string, unknown> = isPlainObject(defaults) ? { ...defaults } : {};
  for (const [key, value] of Object.entries(overrides)) {
    const current = result[key];
    result[key] = isPlainObject(value) && isPlainObject(current)
      ? mergeDefaults(current, value)
      : value;
  }

  return result as T;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date);
}

function coerceEnvValue(value: string): string | number | boolean {
  if (value === 'true') return true;
  if (value === 'false') return false;
  if (/^-?\d+$/.test(value)) return Number.parseInt(value, 10);
  if (/^-?\d+\.\d+$/.test(value)) return Number.parseFloat(value);
  return value;
}

/** Create a default dev-loop.yaml config file if it doesn't exist */
export async function createDefaultConfig(projectDir: string): Promise<string> {
  const configPath = path.join(projectDir, 'dev-loop.yaml');

  if (fs.existsSync(configPath)) {
    return configPath;
  }

  const defaultContent = `# dev-loop configuration
# Generated by dev-loop init

version: "1"

planning:
  primary:
    provider: anthropic
    model: claude-sonnet-4-6
    api_key: \${ANTHROPIC_API_KEY}
    temperature: 0.3
    max_tokens: 8192
  auto_select: false
  scoring: true

coding:
  primary:
    provider: auto
    model: auto
    temperature: 0.2
    max_tokens: 16384
  auto_select:
    enabled: true
    prefer_local: true
    prefer_cheapest: true
    prefer_fastest: true
    max_cost_per_1k_tokens: 0.002
    auto_switch_on_repeated_failure: true
    failure_threshold: 2
    notify_on_switch: true
    auto_confirm_switch: false
  warm_state: true
  warmup_prompt: true

verifier:
  provider: claude-code-cli
  model: claude-sonnet-4-6
  effort:
    default: medium
    auto_adjust: true
  confidence_score:
    enabled: true
    notify_below: 0.7
  asymmetric:
    enabled: true
    risk_threshold: 0.4
    cheap_verifier: codex-cli
    expensive_verifier: claude-code-cli

fallback:
  provider: claude-code-cli
  effort: high
  max_attempts: 1

loop:
  max_retry: 5
  retry_delay_seconds: 2
  diff_aware: true
  sandbox_mode: true
  checkpoint: true
  smart_retry: true
  incremental_testing: true
  idempotency_check: true
  cost_budget_usd: 5.00
  time_budget_minutes: 60
  warmup_prompt: true
  conversation_memory: true
  uncertain_tag: "TODO:UNCERTAIN"
  uncertain_notify: true
  auto_rollback: true

test_runner:
  type: command
  command: pytest
  args: ["-v", "--tb=short"]
  timeout_seconds: 300

quality_gate:
  enabled: true
  block_commit_on_failure: true
  checks:
    test_coverage_min: 80
    complexity_max: 10
    secrets: true
    vulnerabilities: true
    mcp_score_min: 0
    uncertain_tags: true
    lint: true
    type_coverage_min: 0

mcp:
  enabled: true
  injection_detection: true
  servers: []

context:
  code_map: true
  decisions: true
  patterns: true
  semantic_search: true
  token_cache: true
  max_context_tokens: 100000

learning:
  error_patterns:
    enabled: true
    threshold: 1
    auto_inject: true
    versioned: true
  success_patterns:
    enabled: true
  model_calibration:
    enabled: true
    track_time_of_day: true
    track_feature_type: true
    track_language: true

notifications:
  desktop:
    enabled: true
    events: [success, failure]

git:
  auto_commit: true
  commit_prefix: feat
  commit_message_template: "{prefix}: {feature_summary}"
  sign_commits: false
  auto_changelog: true
  semantic_versioning: true

agents:
  supervisor: true
  specialized:
    planning: false
    testing: false
    refactoring: false
    documentation: false
    security: false

ui:
  port: 3747
  host: localhost
  open_browser: true
  theme: dark
  real_time_updates: true

observability:
  anomaly_detection: true
  sla_minutes: 0
  trend_analysis: true
  natural_language_queries: true
`;

  fs.writeFileSync(configPath, defaultContent, 'utf-8');
  return configPath;
}

/** Write updated config values back to dev-loop.yaml */
export async function saveConfig(
  projectDir: string = process.cwd(),
  updates: Record<string, unknown>,
): Promise<void> {
  const configPath = path.join(projectDir, 'dev-loop.yaml');
  const rawExisting = fs.existsSync(configPath)
    ? parseYamlConfig(fs.readFileSync(configPath, 'utf-8'))
    : {};
  const base = mergeDefaults(ConfigSchema.parse({}), rawExisting);
  const merged = mergeDefaults(base, updates);
  const validated = ConfigSchema.parse(merged);

  fs.writeFileSync(configPath, YAML.stringify(validated), 'utf-8');
}
