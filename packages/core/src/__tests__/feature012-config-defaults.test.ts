// Tests for FEATURE012 - Config Defaults and Pricing Table
// Verifies DEFAULT_CONFIG parses against ConfigSchema, email scheduled_digest exists,
// and getModelPricing handles known/unknown/local providers correctly.

import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG, MODEL_PRICING, getModelPricing } from '../config/defaults.js';

describe('FEATURE012 - Config Defaults and Pricing Table', () => {
  describe('DEFAULT_CONFIG parses against ConfigSchema', () => {
    it('ConfigSchema.parse(DEFAULT_CONFIG) succeeds without errors', async () => {
      const { ConfigSchema } = await import('../config/schema.js');
      const result = ConfigSchema.safeParse(DEFAULT_CONFIG);

      if (!result.success) {
        console.error('DEFAULT_CONFIG validation failed:', JSON.stringify(result.error.issues, null, 2));
      }
      expect(result.success).toBe(true);
    });
  });

  describe('email scheduled_digest defaults', () => {
    it('notifications.email.scheduled_digest has enabled and cron fields', () => {
      expect(DEFAULT_CONFIG.notifications?.email?.scheduled_digest).toBeDefined();
      expect(typeof DEFAULT_CONFIG.notifications!.email!.scheduled_digest.enabled).toBe('boolean');
      expect(typeof DEFAULT_CONFIG.notifications!.email!.scheduled_digest.cron).toBe('string');
    });

    it('email scheduled_digest cron is a valid 5-field cron expression', () => {
      const cron = DEFAULT_CONFIG.notifications?.email?.scheduled_digest?.cron;
      expect(cron).toBeTruthy();
      const parts = cron!.split(/\s+/);
      expect(parts.length).toBeGreaterThanOrEqual(5);
    });
  });

  describe('MODEL_PRICING structure', () => {
    it('has openrouter entries for known providers/models', () => {
      expect(MODEL_PRICING.openrouter['anthropic/claude-sonnet-4-6']).toBeDefined();
      const pricing = MODEL_PRICING.openrouter['anthropic/claude-sonnet-4-6'];
      expect(typeof pricing.input).toBe('number');
      expect(typeof pricing.output).toBe('number');
    });

    it('has local entry with zero costs', () => {
      expect(MODEL_PRICING.local).toBeDefined();
      expect(MODEL_PRICING.local.input).toBe(0);
      expect(MODEL_PRICING.local.output).toBe(0);
    });
  });

  describe('getModelPricing behavior', () => {
    it('returns known pricing for openrouter/anthropic/claude-sonnet-4-6', () => {
      const result = getModelPricing('openrouter', 'anthropic/claude-sonnet-4-6');
      expect(result.input).toBe(0.003);
      expect(result.output).toBe(0.015);
    });

    it('returns known pricing for openrouter/openai/gpt-4o', () => {
      const result = getModelPricing('openrouter', 'openai/gpt-4o');
      expect(result.input).toBe(0.0025);
      expect(result.output).toBe(0.01);
    });

    it('returns zero pricing for unknown providers (never throws)', () => {
      const result = getModelPricing('nonexistent', 'some-model');
      expect(result.input).toBe(0);
      expect(result.output).toBe(0);
    });

    it('returns zero pricing for local provider', () => {
      const result = getModelPricing('local', 'any-local-model');
      expect(result.input).toBe(0);
      expect(result.output).toBe(0);
    });

    it('returns zero pricing for ollama provider', () => {
      const result = getModelPricing('ollama', 'qwen:7b');
      expect(result.input).toBe(0);
      expect(result.output).toBe(0);
    });

    it('returns zero pricing for lmstudio provider', () => {
      const result = getModelPricing('lmstudio', 'local-model');
      expect(result.input).toBe(0);
      expect(result.output).toBe(0);
    });

    it('returns known pricing when model not found in openrouter but provider exists', () => {
      const result = getModelPricing('openrouter', 'unknown/model-name');
      expect(result.input).toBe(0);
      expect(result.output).toBe(0);
    });
  });
});