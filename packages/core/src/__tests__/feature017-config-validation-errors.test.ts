// packages/core/src/__tests__/feature017-config-validation-errors.test.ts
// TDD tests for FEATURE017 - Config Validation Error Reporting

import { describe, expect, it } from 'vitest';
import { safeParseWithMessage } from '../config/errors.js';
import { ConfigSchema } from '../config/schema.js';

describe('FEATURE017 - Config Validation Error Reporting', () => {
  it('formats invalid provider with key path and suggestion', () => {
    const result = safeParseWithMessage(ConfigSchema, {
      coding: { primary: { provider: 'not-a-real-provider' } },
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      const msg = result.message;
      expect(msg).toContain('coding');
      expect(msg).toContain('provider');
      expect(msg).not.toContain('sk-');
    }
  });

  it('formats invalid port number with expected type', () => {
    const result = safeParseWithMessage(ConfigSchema, {
      ui: { port: 'not-a-number' },
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      const msg = result.message;
      expect(msg).toContain('ui');
      expect(msg).toContain('port');
    }
  });

  it('redacts secret-like values from error message', () => {
    const result = safeParseWithMessage(ConfigSchema, {
      planning: {
        primary: {
          provider: 'anthropic',
          model: 'claude-sonnet-4-6',
          api_key: 12345, // invalid type for string field → triggers validation error on secret-like key
        },
      },
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      const msg = result.message;
      // Should not leak the actual value.
      expect(msg).not.toContain('12345');
      // The redaction should be triggered for api_key path.
      expect(msg.toLowerCase()).toContain('redacted');
    }
  });

  it('returns structured per-issue data with path, received kind, and expected kind (BUG037)', () => {
    const result = safeParseWithMessage(ConfigSchema, {
      coding: { primary: { provider: 'bad' } },
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(typeof result.message).toBe('string');
      const details = result.details as { issues: Array<{ path: string; expected?: string }> };
      expect(Array.isArray(details.issues)).toBe(true);
      const providerIssue = details.issues.find(issue => issue.path === 'coding.primary.provider');
      expect(providerIssue).toBeDefined();
    }
  });

  it('includes a suggested fix listing valid options for an invalid enum value (BUG037)', () => {
    const result = safeParseWithMessage(ConfigSchema, {
      coding: { primary: { provider: 'not-a-real-provider' } },
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.message.toLowerCase()).toContain('use one of');
      expect(result.message).toContain('auto');
    }
  });

  it('includes a suggested fix for an invalid type value (BUG037)', () => {
    const result = safeParseWithMessage(ConfigSchema, {
      ui: { port: 'not-a-number' },
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.message.toLowerCase()).toContain('provide a number');
    }
  });

  it('is exported from config/errors module', () => {
    // Ensure the function is importable without pulling in production schema parsing.
    expect(typeof safeParseWithMessage).toBe('function');
  });

  it('handles deeply nested invalid value and includes full path', () => {
    const result = safeParseWithMessage(ConfigSchema, {
      loop: {
        max_retry: 'zero', // should be a number > 0
      },
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.message).toContain('loop');
      expect(result.message).toContain('max_retry');
    }
  });
});