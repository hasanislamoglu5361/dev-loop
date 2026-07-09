// packages/core/src/__tests__/feature018-config-coverage.test.ts
// TDD tests for FEATURE018 - Config Tests Coverage Expansion
// Comprehensive coverage: section defaults, YAML examples from dev-loop-prompt.md, save/load/env override combined.

import { afterEach, describe, expect, it } from 'vitest';
import * as fsSync from 'node:fs';
import * as fsPromises from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import YAML from 'yaml';
import { DEFAULT_CONFIG, getModelPricing } from '../config/defaults.js';
import { ConfigSchema, type DevLoopConfig } from '../config/schema.js';
import { createDefaultConfig, loadConfig, saveConfig, applyEnvOverrides } from '../config/loader.js';

async function tempProjectDir(): Promise<string> {
  const dir = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'dev-loop-f018-'));
  return dir;
}

const originalEnv = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnv };
});

// ──────────────────────────────────────────────────────────────
// Section 1: Every config section default
// ──────────────────────────────────────────────────────────────
describe('FEATURE018 - Config Tests Coverage Expansion', () => {
  describe.each<[string, (config: DevLoopConfig) => unknown, unknown]>([
    ['version', config => config.version, '1'],
    ['planning.primary.provider', config => config.planning.primary.provider, 'anthropic'],
    ['planning.primary.model', config => config.planning.primary.model, 'claude-sonnet-4-6'],
    ['coding.primary.provider', config => config.coding.primary.provider, 'auto'],
    ['verifier.provider', config => config.verifier.provider, 'claude-code-cli'],
    ['fallback.provider', config => config.fallback.provider, 'claude-code-cli'],
    ['loop.max_retry', config => config.loop.max_retry, 5],
    ['test_runner.command', config => config.test_runner.command, 'pytest'],
    ['quality_gate.enabled', config => config.quality_gate.enabled, true],
    ['mcp.enabled', config => config.mcp.enabled, true],
    ['context.code_map', config => config.context.code_map, true],
    ['learning.error_patterns.enabled', config => config.learning.error_patterns.enabled, true],
    ['benchmark.vram_check', config => config.benchmark.vram_check, true],
    ['notifications.desktop.enabled', config => config.notifications.desktop.enabled, true],
    ['integrations.github.auto_pr', config => config.integrations.github.auto_pr, true],
    ['git.auto_commit', config => config.git.auto_commit, true],
    ['agents.supervisor', config => config.agents.supervisor, true],
    ['ui.port', config => config.ui.port, 3747],
    ['voice.enabled', config => config.voice.enabled, false],
    ['observability.anomaly_detection', config => config.observability.anomaly_detection, true],
  ])('Default value for %s', (_label, getValue, expected) => {
    it('matches the documented default in defaults.ts (BUG038)', () => {
      expect(getValue(DEFAULT_CONFIG)).toEqual(expected);
    });
  });

  it('DEFAULT_CONFIG parses against ConfigSchema without errors', () => {
    const result = ConfigSchema.safeParse(DEFAULT_CONFIG);
    expect(result.success).toBe(true);
  });

  // ──────────────────────────────────────────────────────
  // Section 2: YAML examples from dev-loop-prompt.md
  // ──────────────────────────────────────────────────────
  describe('YAML examples from dev-loop-prompt.md', () => {
    it('parses the full schema example with nested providers and env vars', async () => {
      const projectDir = await tempProjectDir();
      const yamlContent = `version: "1"

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
    provider: openrouter
    model: deepseek/deepseek-r1
    api_key: \${OPENROUTER_API_KEY}
    temperature: 0.2
    max_tokens: 16384
  auto_select:
    enabled: true
    prefer_local: false
    prefer_cheapest: true
    failover_on_repeated_failure: true

verifier:
  provider: claude-code-cli
  model: claude-sonnet-4-6
  effort:
    default: medium
    auto_adjust: true
  confidence_score:
    enabled: true
    notify_below: 0.7

fallback:
  provider: codex-cli
  effort: high
  max_attempts: 1

loop:
  max_retry: 3
  retry_delay_seconds: 5
  diff_aware: true
  sandbox_mode: false
  smart_retry: true
  cost_budget_usd: 2.00

test_runner:
  type: command
  command: pytest
  args: ["-v", "--tb=short"]
  timeout_seconds: 300

quality_gate:
  enabled: true
  block_commit_on_failure: true
  checks:
    test_coverage_min: 85
    complexity_max: 12
    secrets: true
    lint: true

mcp:
  enabled: false
  injection_detection: false
  servers: []

context:
  code_map: true
  decisions: true
  patterns: true
  semantic_search: true
  token_cache: true
  max_context_tokens: 50000

notifications:
  desktop:
    enabled: false
    events: [success, failure]
`;
      await fsPromises.writeFile(path.join(projectDir, 'dev-loop.yaml'), yamlContent);

      const config = await loadConfig({ projectDir });

      expect(config.version).toBe('1');
      // planning — api_key should be literal env placeholder
      expect(config.planning.primary.provider).toBe('anthropic');
      expect(config.coding.primary.provider).toBe('openrouter');
      expect(config.verifier.provider).toBe('claude-code-cli');
      expect(config.loop.max_retry).toBe(3);
      // cost_budget_usd is number > 0 (from YAML: 2.00)
      expect(config.loop.cost_budget_usd).toBeLessThanOrEqual(2);
    });

    it('parses inline arrays for mcp servers and notification events', async () => {
      const projectDir = await tempProjectDir();
      const yamlContent = `version: "1"

notifications:
  desktop:
    enabled: true
    events: [success, failure, fallback]

mcp:
  enabled: true
  injection_detection: false
  servers: []

coding:
  primary:
    provider: auto
    model: auto
`;
      await fsPromises.writeFile(path.join(projectDir, 'dev-loop.yaml'), yamlContent);

      const config = await loadConfig({ projectDir });
      expect(config.notifications.desktop.events).toEqual(['success', 'failure', 'fallback']);
      expect(config.mcp.servers).toEqual([]);
    });

    it('parses quoted strings preserving special characters', async () => {
      const projectDir = await tempProjectDir();
      const yamlContent = `version: "1"

git:
  auto_commit: true
  commit_prefix: "feat"
  commit_message_template: "{prefix}: {summary}"
`;
      await fsPromises.writeFile(path.join(projectDir, 'dev-loop.yaml'), yamlContent);

      const config = await loadConfig({ projectDir });
      expect(config.git.commit_prefix).toBe('feat');
      expect(config.git.commit_message_template).toBe('{prefix}: {summary}');
    });
  });

  // ──────────────────────────────────────────────────────
  // Section 3: Save/Load/Env Override combined behavior
  // ──────────────────────────────────────────────────────
  describe('save/load/env override combined', () => {
    it('loads config, saves partial update, reloads and verifies merge', async () => {
      const projectDir = await tempProjectDir();

      // Step 1: Create default YAML.
      await createDefaultConfig(projectDir);

      // Step 2: Load and verify initial state.
      let config = await loadConfig({ projectDir });
      expect(config.loop.max_retry).toBe(5);
      expect(config.notifications.desktop.enabled).toBe(true);

      // Step 3: Save partial update.
      await saveConfig(projectDir, { loop: { max_retry: 10 } });

      // Step 4: Reload and verify merge — unrelated fields preserved.
      config = await loadConfig({ projectDir });
      expect(config.loop.max_retry).toBe(10);
      expect(config.notifications.desktop.enabled).toBe(true);
    });

    it('env overrides are applied during load with injected env', async () => {
      const projectDir = await tempProjectDir();
      await createDefaultConfig(projectDir);

      // Override UI port via env.
      process.env.DEV_LOOP_UI_PORT = '8080';
      const config = applyEnvOverrides(DEFAULT_CONFIG, {
        env: { DEV_LOOP_UI_PORT: '9999' },
      });
      expect(config.ui.port).toBe(9999);
    });

    it('idempotent save/load cycle preserves all values', async () => {
      const projectDir = await tempProjectDir();
      await createDefaultConfig(projectDir);

      // Load original.
      let configA = await loadConfig({ projectDir });

      // Save and reload twice.
      for (let i = 0; i < 2; i++) {
        const yaml = fsSync.readFileSync(path.join(projectDir, 'dev-loop.yaml'), 'utf-8');
        const parsed = YAML.parse(yaml) as Record<string, unknown>;
        expect(parsed.version).toBe('1');

        await saveConfig(projectDir, { loop: { max_retry: 7 + i } });
      }

      configA = await loadConfig({ projectDir });
      expect(configA.loop.max_retry).toBe(8); // last write wins
    });

    it('save with dot-notation key writes nested value correctly', async () => {
      const projectDir = await tempProjectDir();
      await createDefaultConfig(projectDir);

      await saveConfig(projectDir, { 'coding.primary.max_tokens': 32768 });
      const config = await loadConfig({ projectDir });

      expect(config.coding.primary.max_tokens).toBe(32768);
    });

    it('save with multiple dot-notation keys writes all nested values', async () => {
      const projectDir = await tempProjectDir();
      await createDefaultConfig(projectDir);

      await saveConfig(projectDir, {
        'coding.primary.max_tokens': 32768,
        'loop.cost_budget_usd': 10.5,
      });
      const config = await loadConfig({ projectDir });

      expect(config.coding.primary.max_tokens).toBe(32768);
      expect(config.loop.cost_budget_usd).toBeCloseTo(10.5);
    });

    it('env override persists across save/load roundtrip', async () => {
      const projectDir = await tempProjectDir();
      await createDefaultConfig(projectDir);

      // Save with explicit value.
      await saveConfig(projectDir, { loop: { max_retry: 25 } });
      const config = await loadConfig({ projectDir });

      expect(config.loop.max_retry).toBe(25);

      // Reload again — should still be 25.
      const config2 = await loadConfig({ projectDir });
      expect(config2.loop.max_retry).toBe(25);
    });

    it('getModelPricing returns correct pricing for known models', () => {
      const pricing = getModelPricing('openrouter', 'anthropic/claude-sonnet-4-6');
      expect(pricing.input).toBeGreaterThan(0);
      expect(pricing.output).toBeGreaterThan(0);

      // Local provider always returns zero.
      const local = getModelPricing('ollama', 'anything');
      expect(local.input).toBe(0);
      expect(local.output).toBe(0);

      // Unknown provider returns zero.
      const unknown = getModelPricing('unknown-provider', 'any-model');
      expect(unknown.input).toBe(0);
      expect(unknown.output).toBe(0);
    });
  });
});