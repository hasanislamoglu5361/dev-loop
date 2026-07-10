import { describe, expect, it } from 'vitest';
import {
  REDACTED,
  redactSecrets,
  safeJsonStringify,
} from '../utils/redaction.js';

describe('FEATURE037 - secret redaction utilities', () => {
  it('redacts representative API keys, tokens, passwords, and webhooks', () => {
    const redacted = redactSecrets({
      openai: 'sk-1234567890abcdefghijklmnopqrstuvwxyz',
      github: 'ghp_1234567890abcdefghijklmnopqrstuvwxyz',
      slack: 'https://hooks.slack.com/services/T000/B000/abcdef',
      password: 'hunter2',
      Authorization: 'Bearer secret-token',
      model: 'gpt-4o',
      max_tokens: 8192,
    });

    expect(redacted).toEqual({
      openai: REDACTED,
      github: REDACTED,
      slack: REDACTED,
      password: REDACTED,
      Authorization: REDACTED,
      model: 'gpt-4o',
      max_tokens: 8192,
    });
  });

  it('redacts nested objects and arrays without mutating the original object', () => {
    const input = {
      planning: {
        primary: {
          api_key: 'sk-abcdefghijklmnopqrstuvwxyz123456',
          model: 'claude-3-5-sonnet',
        },
      },
      integrations: [
        { name: 'github', token: 'ghp_abcdefghijklmnopqrstuvwxyz123456' },
        { name: 'linear', team_id: 'team-1' },
      ],
    };

    const redacted = redactSecrets(input);

    expect(redacted).toEqual({
      planning: {
        primary: {
          api_key: REDACTED,
          model: 'claude-3-5-sonnet',
        },
      },
      integrations: [
        { name: 'github', token: REDACTED },
        { name: 'linear', team_id: 'team-1' },
      ],
    });
    expect(input.planning.primary.api_key).toBe('sk-abcdefghijklmnopqrstuvwxyz123456');
    expect(input.integrations[0]?.token).toBe('ghp_abcdefghijklmnopqrstuvwxyz123456');
  });

  it('redacts env-style secret keys case-insensitively', () => {
    expect(redactSecrets({
      OPENAI_API_KEY: 'sk-abcdefghijklmnopqrstuvwxyz123456',
      SLACK_WEBHOOK_URL: 'https://hooks.slack.com/services/T000/B000/abcdef',
      DEV_LOOP_CONTEXT_TOKEN_CACHE: true,
    })).toEqual({
      OPENAI_API_KEY: REDACTED,
      SLACK_WEBHOOK_URL: REDACTED,
      DEV_LOOP_CONTEXT_TOKEN_CACHE: true,
    });
  });

  it('safe JSON stringify redacts secrets and handles circular data', () => {
    const input: Record<string, unknown> = {
      apiKey: 'sk-abcdefghijklmnopqrstuvwxyz123456',
      model: 'gpt-4o-mini',
    };
    input.self = input;

    const json = safeJsonStringify(input, 2);

    expect(json).toContain(`"apiKey": "${REDACTED}"`);
    expect(json).toContain('"model": "gpt-4o-mini"');
    expect(json).toContain('"self": "[Circular]"');
    expect(json).not.toContain('sk-abcdefghijklmnopqrstuvwxyz123456');
  });
});
