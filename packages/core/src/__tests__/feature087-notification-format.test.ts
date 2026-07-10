import { describe, expect, it } from 'vitest';
import { formatNotificationMessage } from '../notifications/format.js';

describe('FEATURE087 - Notification Formatters', () => {
  it('Test each event type', () => {
    const events = [
      'success',
      'failure',
      'fallback',
      'uncertain',
      'low_confidence',
      'cost_time',
      'model_switch',
      'quality_failure',
      'injection',
      'migration',
      'pattern_conflict',
      'anomaly',
      'smoke_test',
    ] as const;

    for (const event of events) {
      const message = formatNotificationMessage({
        type: event,
        loopId: 'loop-1',
        title: 'Feature work',
        detail: 'Action required',
      });

      expect(message).toContain('loop-1');
      expect(message).toContain('Action required');
      expect(message.length).toBeGreaterThan(20);
    }
  });

  it('Test fallback for unknown event', () => {
    expect(formatNotificationMessage({
      type: 'custom:event',
      loopId: 'loop-2',
      detail: 'custom detail',
    })).toBe('Notification custom:event for loop-2: custom detail');
  });

  it('Test redaction', () => {
    const message = formatNotificationMessage({
      type: 'failure',
      loopId: 'loop-secret',
      detail: 'Failed with api key sk-abcdefghijklmnopqrstuvwxyz123456 and password hunter2',
      data: {
        token: 'do-not-print',
        nested: { authorization: 'Bearer abc' },
      },
    });

    expect(message).toContain('[REDACTED]');
    expect(message).not.toContain('sk-abcdefghijklmnopqrstuvwxyz123456');
    expect(message).not.toContain('hunter2');
    expect(message).not.toContain('do-not-print');
    expect(message).not.toContain('Bearer abc');
  });

  it('Test redaction of secret shapes embedded directly in detail (not data)', () => {
    const slackMessage = formatNotificationMessage({
      type: 'failure',
      loopId: 'loop-9',
      detail: 'Webhook delivery failed: https://hooks.slack.com/services/T000/B000/XXXXXXXXXXXXXXXXXXXXXXXX',
    });

    expect(slackMessage).not.toContain('https://hooks.slack.com/services/T000/B000/XXXXXXXXXXXXXXXXXXXXXXXX');
    expect(slackMessage).toContain('[REDACTED]');

    const githubMessage = formatNotificationMessage({
      type: 'failure',
      loopId: 'loop-10',
      title: 'Push failed using ghp_1234567890abcdefghijklmnopqrstuvwxyz',
    });

    expect(githubMessage).not.toContain('ghp_1234567890abcdefghijklmnopqrstuvwxyz');
    expect(githubMessage).toContain('[REDACTED]');
  });
});
