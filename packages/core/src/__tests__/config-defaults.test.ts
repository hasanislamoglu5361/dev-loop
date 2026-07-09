import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG } from '../config/defaults.js';
import { ConfigSchema } from '../config/schema.js';

describe('configuration defaults', () => {
  it('provides complete quality gate defaults', () => {
    const config = ConfigSchema.parse({});

    expect(config.quality_gate.checks.test_coverage_min).toBe(80);
    expect(config.quality_gate.checks.secrets).toBe(true);
    expect(config.quality_gate.checks.mcp_score_min).toBe(0);
  });

  it('default config satisfies agents and email schemas', () => {
    const config = ConfigSchema.parse(DEFAULT_CONFIG);

    expect(config.agents.specialized.security).toBe(false);
    expect(config.notifications.email.scheduled_digest.cron).toBe('0 8 * * 1');
  });
});
