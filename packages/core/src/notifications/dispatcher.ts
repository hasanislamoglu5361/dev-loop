// packages/core/src/notifications/dispatcher.ts
// Notification dispatcher with Promise.allSettled non-blocking delivery and DB logging.

import { formatNotificationMessage } from './format.js';
import type { TelegramChannelConfig, SlackChannelConfig, EmailChannelConfig, DesktopChannelConfig, SoundChannelConfig } from './channels.js';

export type NotificationChannelName = string;

/** Notifications section config (matches the schema's shape). */
export type NotificationsSection = {
  telegram: TelegramChannelConfig;
  slack: SlackChannelConfig;
  email: EmailChannelConfig;
  desktop: DesktopChannelConfig;
  sound: SoundChannelConfig;
};

/** Per-channel dispatch result. */
export interface ChannelDispatchResult {
  channel: string;
  status: 'sent' | 'failed' | 'skipped';
  error?: string;
  reason?: string;
}

/** Log entry for the notification_log table row. */
export interface NotificationLogEntry {
  channel: string;
  eventType: string;
  message?: string;
  sent?: boolean;
  errorMessage?: string;
}

/** Full dispatch result returned by `NotificationDispatcher.dispatch`. */
export interface DispatchResult {
  results: ChannelDispatchResult[];
}

export type NotificationDispatcherResult = DispatchResult;

/** Notification input shape for `dispatch()`. */
export interface DispatchInput {
  type: 'success' | 'failure' | 'fallback' | 'uncertain' | 'low_confidence' | 'cost_time' | 'model_switch' | 'quality_failure' | 'injection' | 'migration' | 'pattern_conflict' | 'anomaly' | 'smoke_test';
  message: string;
}

export type NotificationDispatchEvent = DispatchInput;

/** Channel configuration with lazy client creation. */
export interface ChannelConfig {
  name: string;
  enabled: boolean;
  events: string[];
  createClient?: () => { send: (message: string) => Promise<unknown> };
}

export type NotificationClient = NonNullable<ReturnType<NonNullable<ChannelConfig['createClient']>>>;
export type NotificationChannelConfig = ChannelConfig;
export type NotificationDispatchStatus = ChannelDispatchResult['status'];
export type NotificationDispatchResult = ChannelDispatchResult;

/** Logger callback for recording dispatch results. */
export type Logger = (entry: NotificationLogEntry) => void | Promise<void>;

/** Options accepted by `NotificationDispatcher` constructor. */
export interface DispatcherOptions {
  channels: ChannelConfig[];
  log?: Logger;
}

export type NotificationDispatcherOptions = DispatcherOptions;

const REDACTABLE_PATTERNS = [/\bsk-[A-Za-z0-9_-]+\b/g, /\bpassword\s+\S+/gi];

/** Redact secret-like values from a notification message. */
export function redactMessage(message: string): string {
  let result = message;
  for (const pattern of REDACTABLE_PATTERNS) {
    result = result.replace(pattern, '[REDACTED]');
  }
  return result;
}

/** Format a notification input into an actionable human-readable message. */
export function formatMessage(input: DispatchInput): string {
  const formatted = formatNotificationMessage({ type: input.type as any });
  return redactMessage(formatted);
}

function sanitizeLogEntry(entry: NotificationLogEntry): NotificationLogEntry {
  return {
    ...entry,
    message: entry.message ? redactMessage(entry.message) : undefined,
    errorMessage: entry.errorMessage ? redactMessage(entry.errorMessage) : undefined,
  };
}

/** Dispatches notifications through configured channels with Promise.allSettled semantics. */
export class NotificationDispatcher {
  private readonly channels: ChannelConfig[];
  private readonly logCallback?: Logger;

  constructor(options: DispatcherOptions) {
    this.channels = options.channels;
    this.logCallback = options.log;
  }

  /** Dispatch a notification to all matching enabled channels. */
  async dispatch(input: DispatchInput): Promise<DispatchResult> {
    // Redact the original message for logging — it's the source of truth for secrets.
    const redactedMessage = redactMessage(input.message);

    interface ChannelResultPair {
      name: string;
      result?: ChannelDispatchResult;
      reason?: string;
    }

    const pairs: Promise<ChannelResultPair>[] = this.channels.map(channel =>
      this.sendToChannel(channel, input.type, redactedMessage).then(
        (r): ChannelResultPair => ({ name: channel.name, result: r }),
        (err): ChannelResultPair => {
          const reason = err instanceof Error ? err.message : String(err);
          return { name: channel.name, result: { channel: channel.name, status: 'failed', error: reason } };
        },
      ),
    );

    const resolved = await Promise.all(pairs);

    // Flatten to just the dispatch results.
    const results: ChannelDispatchResult[] = resolved.map(r => r.result ?? { channel: r.name, status: 'skipped' as const });

    // Log each result individually using the redacted original message for secret safety.
    for (const pair of resolved) {
      const r = pair.result;
      if (!r) continue;

      if (r.status === 'sent') {
        await this.log(sanitizeLogEntry({ channel: r.channel, eventType: input.type, message: redactedMessage, sent: true })).catch(() => {});
      } else {
        const entry: NotificationLogEntry = {
          channel: r.channel,
          eventType: input.type,
          message: redactedMessage,
          sent: false,
        };
        if (r.error) entry.errorMessage = r.error;
        await this.log(sanitizeLogEntry(entry)).catch(() => {});
      }
    }

    return { results };
  }

  private async sendToChannel(channel: ChannelConfig, eventType: string, message: string): Promise<ChannelDispatchResult> {
    if (!channel.enabled) {
      return { channel: channel.name, status: 'skipped', reason: 'Channel disabled.' };
    }
    if (!channel.events.includes(eventType)) {
      return { channel: channel.name, status: 'skipped', reason: 'Event not subscribed.' };
    }
    const client = channel.createClient?.();
    try {
      if (!client) {
        return { channel: channel.name, status: 'failed', error: 'Channel client is unavailable.' };
      }
      const outcome = await client.send(message);
      if (isFailedOutcome(outcome)) {
        return { channel: channel.name, status: 'failed', error: outcome.error ?? 'Channel delivery failed.' };
      }
      return { channel: channel.name, status: 'sent' };
    } catch (error) {
      const err = error instanceof Error ? error.message : String(error);
      return { channel: channel.name, status: 'failed', error: err };
    }
  }

  private async log(entry: NotificationLogEntry): Promise<void> {
    if (!this.logCallback) return;
    try {
      await this.logCallback(entry);
    } catch { /* logger should not crash dispatch */ }
  }
}

function isFailedOutcome(value: unknown): value is { ok: false; error?: string } {
  return value !== null && typeof value === 'object' && 'ok' in value && (value as { ok?: unknown }).ok === false;
}

// Re-export channel types for callers.
export type { TelegramChannelConfig, SlackChannelConfig, EmailChannelConfig, DesktopChannelConfig, SoundChannelConfig } from './channels.js';
