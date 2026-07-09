// packages/core/src/__tests__/feature011-config-schema-skeleton.test.ts
// TDD test for FEATURE011: Config Schema Skeleton
// Verifies that section schemas exist as separate imports AND the composed ConfigSchema still works

import { describe, expect, it } from 'vitest';

describe('FEATURE011 - Config Schema Skeleton', () => {
  it('parses an empty config into a complete valid config via composed schema', async () => {
    const { ConfigSchema } = await import('../config/schema.js');
    const config = ConfigSchema.parse({});
    expect(config.version).toBe('1');
    expect(config.loop.max_retry).toBeGreaterThan(0);
    expect(config.planning.primary.provider).toBe('anthropic');
    expect(config.coding.primary.temperature).toBe(0.2);
  });

  it('rejects invalid provider enum with path information', async () => {
    const { ConfigSchema } = await import('../config/schema.js');
    const result = ConfigSchema.safeParse({ planning: { primary: { provider: 'bad' as any, model: 'x', api_key: 'k', temperature: 0.3, max_tokens: 100 }, auto_select: false, scoring: true } });
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map(i => i.path.join('.'));
      expect(paths).toContain('planning.primary.provider');
    }
  });

  it('section schemas can be imported independently and produce same defaults as composed schema', async () => {
    // Import section schemas individually (proves they are separate, composable files)
    const { planningSectionSchema } = await import('../config/sections/planning-schema.js');
    const { codingSectionSchema } = await import('../config/sections/coding-schema.js');
    const { verifierSectionSchema } = await import('../config/sections/verifier-schema.js');
    const { fallbackSectionSchema } = await import('../config/sections/fallback-schema.js');
    const { loopSectionSchema } = await import('../config/sections/loop-schema.js');

    // Each section schema must parse {} into valid defaults matching the original
    const planning = planningSectionSchema.parse({});
    expect(planning.primary.provider).toBe('anthropic');
    expect(planning.auto_select).toBe(false);

    const coding = codingSectionSchema.parse({});
    expect(coding.primary.temperature).toBe(0.2);

    const verifier = verifierSectionSchema.parse({});
    expect(verifier.provider).toBe('claude-code-cli');

    const fallback = fallbackSectionSchema.parse({});
    expect(fallback.max_attempts).toBe(1);

    const loop = loopSectionSchema.parse({});
    expect(loop.max_retry).toBeGreaterThan(0);
  });

  it('section schemas validate enum values independently', async () => {
    const { planningSectionSchema } = await import('../config/sections/planning-schema.js');

    // @ts-expect-error invalid provider for type checking
    const result = planningSectionSchema.safeParse({ primary: { provider: 'invalid-provider' as any, model: 'm', api_key: 'k', temperature: 0.3, max_tokens: 100 } });
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map(i => i.path.join('.'));
      expect(paths).toContain('primary.provider');
    }
  });

  it('all section schemas parse {} without throwing', async () => {
    // Import all 17 section schemas
    const sections = [
      await import('../config/sections/planning-schema.js'),
      await import('../config/sections/coding-schema.js'),
      await import('../config/sections/verifier-schema.js'),
      await import('../config/sections/fallback-schema.js'),
      await import('../config/sections/loop-schema.js'),
      await import('../config/sections/test-runner-schema.js'),
      await import('../config/sections/quality-gate-schema.js'),
      await import('../config/sections/mcp-schema.js'),
      await import('../config/sections/context-schema.js'),
      await import('../config/sections/learning-schema.js'),
      await import('../config/sections/benchmark-schema.js'),
      await import('../config/sections/notifications-schema.js'),
      await import('../config/sections/integrations-schema.js'),
      await import('../config/sections/git-schema.js'),
      await import('../config/sections/agents-schema.js'),
      await import('../config/sections/ui-schema.js'),
      await import('../config/sections/voice-schema.js'),
    ];

    // All must parse {} successfully
    for (const mod of sections) {
      const keys = Object.keys(mod).filter(k => k.endsWith('SectionSchema') || typeof (mod as any)[k] === 'object');
      if (keys.length > 0) {
        // At least find the section schema export and parse it
        for (const key of keys) {
          const schema = mod[key];
          expect(() => schema.parse({})).not.toThrow();
        }
      } else {
        // Fall back: look for any exported zod schema
        const exports = Object.values(mod);
        expect(exports.length).toBeGreaterThan(0);
      }
    }
  });

  it('composed ConfigSchema produces identical defaults to section schemas individually', async () => {
    const { ConfigSchema } = await import('../config/schema.js');
    const composedEmpty = ConfigSchema.parse({});

    // Cross-check key sections
    const { planningSectionSchema } = await import('../config/sections/planning-schema.js');
    const { loopSectionSchema } = await import('../config/sections/loop-schema.js');

    expect(composedEmpty.planning.primary.provider).toBe(planningSectionSchema.parse({}).primary.provider);
    expect(composedEmpty.loop.max_retry).toBe(loopSectionSchema.parse({}).max_retry);
  });
});