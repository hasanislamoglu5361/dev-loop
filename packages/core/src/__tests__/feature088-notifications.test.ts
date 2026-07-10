import { describe, expect, it, vi } from 'vitest';
import { NotificationDispatcher } from '../notifications/dispatcher.js';

describe('FEATURE088 - Notification Channels and Dispatcher', () => {
  it('Test disabled channel skipped', async () => {
    const createClient = vi.fn();
    const dispatcher = new NotificationDispatcher({
      channels: [
        { name: 'telegram', enabled: false, events: ['success'], createClient },
      ],
      log: vi.fn(),
    });

    const result = await dispatcher.dispatch({ type: 'success', message: 'done' });

    expect(result.results).toEqual([
      { channel: 'telegram', status: 'skipped', reason: 'Channel disabled.' },
    ]);
    expect(createClient).not.toHaveBeenCalled();
  });

  it('Test one channel failure does not block others', async () => {
    const telegramSend = vi.fn(async () => undefined);
    const slackSend = vi.fn(async () => {
      throw new Error('slack down');
    });
    const logs: unknown[] = [];
    const dispatcher = new NotificationDispatcher({
      channels: [
        { name: 'telegram', enabled: true, events: ['failure'], createClient: () => ({ send: telegramSend }) },
        { name: 'slack', enabled: true, events: ['failure'], createClient: () => ({ send: slackSend }) },
      ],
      log: async entry => { logs.push(entry); },
    });

    const result = await dispatcher.dispatch({ type: 'failure', message: 'build failed' });

    expect(telegramSend).toHaveBeenCalledWith('build failed');
    expect(slackSend).toHaveBeenCalledWith('build failed');
    expect(result.results).toEqual([
      { channel: 'telegram', status: 'sent' },
      { channel: 'slack', status: 'failed', error: 'slack down' },
    ]);
    expect(logs).toEqual([
      expect.objectContaining({ channel: 'telegram', eventType: 'failure', sent: true }),
      expect.objectContaining({ channel: 'slack', eventType: 'failure', sent: false, errorMessage: 'slack down' }),
    ]);
  });

  it('Test notification log written without leaking credentials', async () => {
    const logs: any[] = [];
    const dispatcher = new NotificationDispatcher({
      channels: [
        { name: 'email', enabled: true, events: ['success'], createClient: () => ({ send: async () => undefined }) },
      ],
      log: async entry => { logs.push(entry); },
    });

    await dispatcher.dispatch({
      type: 'success',
      message: 'token sk-secret-value password hunter2',
    });

    expect(logs).toHaveLength(1);
    expect(logs[0].message).toContain('[REDACTED]');
    expect(logs[0].message).not.toContain('sk-secret-value');
    expect(logs[0].message).not.toContain('hunter2');
  });
});
