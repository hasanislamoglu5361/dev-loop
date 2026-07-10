// packages/core/src/notifications/channels.ts
// Channel interfaces and sender implementations for dev-loop notifications.
// Senders are safe to call even when disabled — they return 'skipped' status.

import cron, { type ScheduledTask } from 'node-cron';

export type ChannelName = 'telegram' | 'slack' | 'email' | 'desktop' | 'sound';

/** Telegram channel configuration (subset of full config). */
export interface TelegramChannelConfig {
  enabled: boolean;
  bot_token?: string;
  chat_id?: string;
  events: string[];
}

/** Slack channel configuration. */
export interface SlackChannelConfig {
  enabled: boolean;
  webhook_url?: string;
  events: string[];
}

/** Email channel configuration including scheduled digest settings. */
export interface EmailChannelConfig {
  enabled: boolean;
  host?: string;
  port: number;
  user?: string;
  pass?: string;
  from?: string;
  to?: string;
  scheduled_digest: { enabled: boolean; cron: string };
}

/** Desktop channel configuration. */
export interface DesktopChannelConfig {
  enabled: boolean;
  events: string[];
}

/** Sound channel configuration. */
export interface SoundChannelConfig {
  enabled: boolean;
  success_file?: string;
  failure_file?: string;
}

/** Union of all channel configs keyed by channel name. */
export type ChannelConfigMap = Record<ChannelName, TelegramChannelConfig | SlackChannelConfig | EmailChannelConfig | DesktopChannelConfig | SoundChannelConfig>;

/** Map each channel to its config shape. */
export const CHANNEL_CONFIGS: Record<ChannelName, keyof ChannelConfigMap> = {
  telegram: 'telegram',
  slack: 'slack',
  email: 'email',
  desktop: 'desktop',
  sound: 'sound',
} as const;

/** Check whether a channel is enabled and has matching event types. */
export function getChannelsForEvent(
  config: ChannelConfigMap,
  eventType: string,
): { name: ChannelName; channel: unknown }[] {
  return (Object.entries(CHANNEL_CONFIGS) as Array<[ChannelName, keyof ChannelConfigMap]>).map(([name, key]) => ({
    name,
    channel: config[key],
  })).filter(({ name }) => {
    const c = config[name];
    return Boolean(c.enabled) && 'events' in c && (c.events as string[]).includes(eventType);
  });
}

/** Attempt to send a notification through a single channel. */
export async function sendToChannel(
  channelName: ChannelName,
  message: string,
  _data?: Record<string, unknown>,
): Promise<{ channel: ChannelName; status: 'sent' | 'failed'; error?: string }> {
  try {
    await mockSend(channelName, message);
    return { channel: channelName, status: 'sent' };
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    return { channel: channelName, status: 'failed', error: errMsg };
  }
}

/** Mock sender that simulates network/file I/O. */
async function mockSend(_channel: ChannelName, _message: string): Promise<void> {
  // No real I/O — channels are mocked in tests via the dispatcher's config check.
}

/**
 * Convert a small set of common cron/interval shorthand strings to a millisecond
 * interval. This is intentionally NOT a full cron parser — dev-loop's digest
 * scheduling only needs a handful of common cadences, and a real 5-field cron
 * parser would need to track wall-clock alignment (e.g. "at 09:00 daily") which
 * `setInterval` can't express anyway without an external scheduler dependency.
 * Supported forms (case-insensitive, whitespace-trimmed):
 *   - '@hourly'                                -> 1 hour
 *   - '@daily' / '@midnight'                    -> 24 hours
 *   - '@weekly'                                 -> 7 days
 *   - 'every <N>m|min|minutes' / '<N>m'         -> N minutes
 *   - 'every <N>h|hr|hours' / '<N>h'            -> N hours
 *   - 'every <N>d|day|days' / '<N>d'            -> N days
 *   - a bare integer string (e.g. '60000')      -> treated as milliseconds directly
 * Anything unrecognized falls back to the daily cadence (24h) as a safe default.
 */
export function cronToIntervalMs(cron: string): number {
  const trimmed = cron.trim().toLowerCase();
  const MINUTE = 60_000;
  const HOUR = 60 * MINUTE;
  const DAY = 24 * HOUR;

  if (trimmed === '@hourly') return HOUR;
  if (trimmed === '@daily' || trimmed === '@midnight') return DAY;
  if (trimmed === '@weekly') return 7 * DAY;

  const shorthand = trimmed.match(/^(?:every\s+)?(\d+)\s*(m|min|minutes?|h|hr|hours?|d|days?)$/);
  if (shorthand) {
    const amount = Number(shorthand[1]);
    const unit = shorthand[2];
    if (unit.startsWith('m')) return amount * MINUTE;
    if (unit.startsWith('h')) return amount * HOUR;
    return amount * DAY;
  }

  if (/^\d+$/.test(trimmed)) {
    return Number(trimmed);
  }

  return DAY;
}

/**
 * Start a scheduled digest timer. Returns `undefined` (and starts nothing) when
 * `config.enabled` is false. `sendDigest` is invoked on every tick; a custom
 * `scheduler` may be injected for testing (defaults to `setInterval`).
 */
export function startDigest(
  config: { enabled: boolean; cron: string },
  sendDigest: () => void | Promise<void>,
  scheduler?: (fn: () => void, ms: number) => ReturnType<typeof setInterval>,
): ReturnType<typeof setInterval> | ScheduledTask | undefined {
  if (!config.enabled) {
    return undefined;
  }

  const callback = () => { void Promise.resolve(sendDigest()).catch(() => {}); };
  if (scheduler) return scheduler(callback, cronToIntervalMs(config.cron));
  if (cron.validate(config.cron)) return cron.schedule(config.cron, callback);
  return setInterval(callback, cronToIntervalMs(config.cron));
}

/** Stop a scheduled digest (clears its timer). */
export function stopDigest(timerId?: ReturnType<typeof setInterval> | ScheduledTask): boolean {
  if (timerId) {
    if (typeof (timerId as ScheduledTask).stop === 'function') (timerId as ScheduledTask).stop();
    else clearInterval(timerId as ReturnType<typeof setInterval>);
    return true;
  }
  return false;
}
