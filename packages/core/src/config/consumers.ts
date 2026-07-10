import type { DevLoopConfig } from './schema.js';

export type ConfigSection = keyof DevLoopConfig;
export type ConfigConsumer = 'config-loader' | 'runtime-composer' | 'cli' | 'ui-server' | 'analytics';

/**
 * Ownership matrix for every top-level configuration section. `satisfies`
 * deliberately makes adding a schema section a compile error until its
 * production consumer is declared here.
 */
export const CONFIG_SECTION_CONSUMERS = {
  version: ['config-loader'],
  planning: ['cli', 'runtime-composer'],
  coding: ['runtime-composer'],
  verifier: ['runtime-composer'],
  fallback: ['runtime-composer'],
  loop: ['runtime-composer'],
  test_runner: ['runtime-composer'],
  quality_gate: ['cli', 'runtime-composer'],
  mcp: ['runtime-composer'],
  context: ['runtime-composer'],
  learning: ['runtime-composer'],
  benchmark: ['cli', 'analytics'],
  notifications: ['runtime-composer'],
  integrations: ['runtime-composer'],
  git: ['runtime-composer'],
  agents: ['runtime-composer'],
  ui: ['cli', 'ui-server'],
  voice: ['cli', 'analytics'],
  observability: ['analytics'],
} as const satisfies Record<ConfigSection, readonly [ConfigConsumer, ...ConfigConsumer[]]>;

export function getConfigConsumers(section: ConfigSection): readonly ConfigConsumer[] {
  return CONFIG_SECTION_CONSUMERS[section];
}
