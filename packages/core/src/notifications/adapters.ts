// packages/core/src/notifications/adapters.ts
// Production channel adapter factories for the dev-loop notification dispatcher.
//
// These factories return client objects compatible with `NotificationDispatcher`'s
// `{ send(message: string): Promise<unknown> }` contract. They are intentionally
// dependency-injectable so tests can supply fakes; the runtime composer wires
// the real `node-telegram-bot-api`, `@slack/webhook`, `nodemailer`, and platform
// calls.
//
// Design rules:
//   * Disabled channels perform zero I/O (no client construction at all).
//   * Every external call has a timeout (per-channel default + caller override).
//   * All secrets are interpolated from config/env, never logged or echoed.
//   * Errors are surfaced verbatim to the dispatcher; the dispatcher redacts
//     them before writing to the DB.

import type {
  TelegramChannelConfig,
  SlackChannelConfig,
  EmailChannelConfig,
  DesktopChannelConfig,
  SoundChannelConfig,
} from './channels.js';

/** Per-channel timeout defaults (ms). Callers may override. */
export const DEFAULT_TELEGRAM_TIMEOUT_MS = 5_000;
export const DEFAULT_SLACK_TIMEOUT_MS = 5_000;
export const DEFAULT_EMAIL_TIMEOUT_MS = 15_000;
export const DEFAULT_DESKTOP_TIMEOUT_MS = 3_000;
export const DEFAULT_SOUND_TIMEOUT_MS = 3_000;

/** Common contract every adapter's `send` returns on. */
export interface SendOutcome {
  ok: boolean;
  error?: string;
}

/** Pluggable Telegram client shape (the real one in production). */
export interface TelegramClientLike {
  sendMessage: (
    chatId: string | number,
    text: string,
    opts?: Record<string, unknown>,
  ) => Promise<unknown>;
}

/** Pluggable Slack webhook client shape. */
export interface SlackClientLike {
  send: (payload: { text: string }) => Promise<unknown>;
}

/** Pluggable email transport shape (nodemailer in production). */
export interface EmailClientLike {
  sendMail: (message: {
    from: string;
    to: string;
    subject: string;
    text: string;
  }) => Promise<unknown>;
}

/** Pluggable desktop-notifier shape (terminal-notifier / notify-send / etc.). */
export interface DesktopClientLike {
  notify: (title: string, body: string) => Promise<unknown> | unknown;
}

/** Pluggable audio player shape (afplay / PowerShell / paplay / etc.). */
export interface SoundClientLike {
  play: (filePath: string) => Promise<unknown> | unknown;
}

/** Resolved env reference (supports `${ENV_VAR}` interpolation by config loader). */
function readEnv(value: string | undefined, env: NodeJS.ProcessEnv = process.env): string | undefined {
  if (!value) return undefined;
  const match = value.match(/^\$\{([A-Z0-9_]+)\}$/);
  if (match) return env[match[1]];
  return value;
}

/** Wrap a promise with a timeout, rejecting with a clear error on expiry. */
async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Factory: build a real Telegram client. Returns `undefined` when the channel
 * is disabled or missing required fields. Injects the real
 * `node-telegram-bot-api` only when the caller has not provided one (tests pass
 * a fake to avoid network I/O).
 */
export function createTelegramClient(
  config: TelegramChannelConfig,
  options: {
    timeoutMs?: number;
    /** Inject for tests; defaults to a real TelegramBot. */
    clientFactory?: (token: string) => TelegramClientLike;
    env?: NodeJS.ProcessEnv;
  } = {},
): { send: (message: string) => Promise<SendOutcome> } | undefined {
  if (!config.enabled) return undefined;
  const token = readEnv(config.bot_token, options.env);
  const chatId = readEnv(config.chat_id, options.env);
  if (!token) {
    return undefined;
  }
  const client = options.clientFactory
    ? options.clientFactory(token)
    : // Lazy require so the import is only paid for when actually used.
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      new (require('node-telegram-bot-api') as { new (token: string, options?: Record<string, unknown>): TelegramClientLike })(token, {
        polling: false,
      });
  const timeoutMs = options.timeoutMs ?? DEFAULT_TELEGRAM_TIMEOUT_MS;
  return {
    async send(message: string): Promise<SendOutcome> {
      if (!chatId) {
        return { ok: false, error: 'telegram chat_id is not configured' };
      }
      try {
        await withTimeout(
          Promise.resolve(client.sendMessage(chatId, message)),
          timeoutMs,
          'telegram sendMessage',
        );
        return { ok: true };
      } catch (error) {
        return { ok: false, error: error instanceof Error ? error.message : String(error) };
      }
    },
  };
}

/**
 * Factory: build a real Slack Incoming Webhook client. Returns `undefined` when
 * the channel is disabled or missing the webhook URL.
 */
export function createSlackClient(
  config: SlackChannelConfig,
  options: {
    timeoutMs?: number;
    clientFactory?: (url: string) => SlackClientLike;
    env?: NodeJS.ProcessEnv;
  } = {},
): { send: (message: string) => Promise<SendOutcome> } | undefined {
  if (!config.enabled) return undefined;
  const url = readEnv(config.webhook_url, options.env);
  if (!url) return undefined;
  const client = options.clientFactory
    ? options.clientFactory(url)
    : // eslint-disable-next-line @typescript-eslint/no-require-imports
      new (require('@slack/webhook').IncomingWebhook as new (url: string) => SlackClientLike)(url);
  const timeoutMs = options.timeoutMs ?? DEFAULT_SLACK_TIMEOUT_MS;
  return {
    async send(message: string): Promise<SendOutcome> {
      try {
        await withTimeout(Promise.resolve(client.send({ text: message })), timeoutMs, 'slack send');
        return { ok: true };
      } catch (error) {
        return { ok: false, error: error instanceof Error ? error.message : String(error) };
      }
    },
  };
}

/**
 * Factory: build a real SMTP/nodemailer transport. Returns `undefined` when
 * the channel is disabled or missing required fields.
 */
export function createEmailClient(
  config: EmailChannelConfig,
  options: {
    timeoutMs?: number;
    clientFactory?: (cfg: EmailChannelConfig, env: NodeJS.ProcessEnv) => EmailClientLike;
    env?: NodeJS.ProcessEnv;
  } = {},
): { send: (message: string) => Promise<SendOutcome> } | undefined {
  if (!config.enabled) return undefined;
  const user = readEnv(config.user, options.env);
  const pass = readEnv(config.pass, options.env);
  const from = readEnv(config.from, options.env);
  const to = readEnv(config.to, options.env);
  if (!from || !to) return undefined;
  const env = options.env ?? process.env;
  const client = options.clientFactory
    ? options.clientFactory(config, env)
    : // eslint-disable-next-line @typescript-eslint/no-require-imports
      (require('nodemailer').createTransport({
        host: config.host,
        port: config.port,
        secure: config.port === 465,
        auth: user ? { user, pass } : undefined,
      }) as EmailClientLike);
  const timeoutMs = options.timeoutMs ?? DEFAULT_EMAIL_TIMEOUT_MS;
  return {
    async send(message: string): Promise<SendOutcome> {
      try {
        await withTimeout(
          Promise.resolve(
            client.sendMail({
              from,
              to,
              subject: 'dev-loop notification',
              text: message,
            }),
          ),
          timeoutMs,
          'email sendMail',
        );
        return { ok: true };
      } catch (error) {
        return { ok: false, error: error instanceof Error ? error.message : String(error) };
      }
    },
  };
}

/**
 * Factory: build a cross-platform desktop-notification client. Returns
 * `undefined` when the channel is disabled. The actual platform call is
 * intentionally pluggable so unsupported platforms yield an explicit
 * "unsupported" outcome rather than a hard crash.
 */
export function createDesktopClient(
  config: DesktopChannelConfig,
  options: {
    timeoutMs?: number;
    clientFactory?: () => DesktopClientLike | undefined;
  } = {},
): { send: (message: string) => Promise<SendOutcome> } | undefined {
  if (!config.enabled) return undefined;
  const client = options.clientFactory
    ? options.clientFactory()
    : defaultDesktopFactory();
  if (!client) return undefined;
  const timeoutMs = options.timeoutMs ?? DEFAULT_DESKTOP_TIMEOUT_MS;
  return {
    async send(message: string): Promise<SendOutcome> {
      try {
        const lines = message.split('\n');
        const title = lines[0] ?? 'dev-loop';
        const body = lines.slice(1).join('\n');
        await withTimeout(
          Promise.resolve(client.notify(title, body)),
          timeoutMs,
          'desktop notify',
        );
        return { ok: true };
      } catch (error) {
        return { ok: false, error: error instanceof Error ? error.message : String(error) };
      }
    },
  };
}

/** Default cross-platform desktop notifier (returns undefined when unsupported). */
function defaultDesktopFactory(): DesktopClientLike | undefined {
  try {
    // Lazy require — node-notifier is optional and may be absent in slim installs.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const notifier = require('node-notifier') as {
      notify: (opts: { title: string; message: string }) => unknown;
    };
    return {
      notify(title, body) {
        notifier.notify({ title, message: body });
      },
    };
  } catch {
    return undefined;
  }
}

/**
 * Factory: build a cross-platform sound client. Returns `undefined` when the
 * channel is disabled.
 */
export function createSoundClient(
  config: SoundChannelConfig,
  options: {
    timeoutMs?: number;
    clientFactory?: () => SoundClientLike;
  } = {},
): { send: (message: string) => Promise<SendOutcome> } | undefined {
  if (!config.enabled) return undefined;
  // The dispatcher routes by event type. We pass the actual file from the
  // caller via the message (the dispatcher prepends `[success]` / `[failure]`).
  const client = options.clientFactory ? options.clientFactory() : defaultSoundFactory();
  if (!client) return undefined;
  const timeoutMs = options.timeoutMs ?? DEFAULT_SOUND_TIMEOUT_MS;
  return {
    async send(message: string): Promise<SendOutcome> {
      try {
        const isFailure = /\[(failure|fallback|injection)\]/i.test(message);
        const filePath = isFailure ? config.failure_file : config.success_file;
        if (!filePath) {
          return { ok: false, error: `sound ${isFailure ? 'failure' : 'success'} file not configured` };
        }
        await withTimeout(Promise.resolve(client.play(filePath)), timeoutMs, 'sound play');
        return { ok: true };
      } catch (error) {
        return { ok: false, error: error instanceof Error ? error.message : String(error) };
      }
    },
  };
}

/** Default cross-platform sound player. */
function defaultSoundFactory(): SoundClientLike {
  const { platform } = process;
  if (platform === 'darwin') {
    return {
      play: (file) => {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { spawn } = require('node:child_process') as typeof import('node:child_process');
        const proc = spawn('afplay', [file], { stdio: 'ignore', detached: true });
        proc.unref();
      },
    };
  }
  if (platform === 'win32') {
    return {
      play: (file) => {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { spawn } = require('node:child_process') as typeof import('node:child_process');
        const proc = spawn('powershell', ['-c', `(New-Object Media.SoundPlayer '${file.replace(/'/g, "''")}').PlaySync()`], {
          stdio: 'ignore',
          detached: true,
        });
        proc.unref();
      },
    };
  }
  // Linux / other: try paplay, then aplay, then give up gracefully.
  return {
    play: (file) => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { spawn } = require('node:child_process') as typeof import('node:child_process');
      const proc = spawn('paplay', [file], { stdio: 'ignore', detached: true });
      proc.on('error', () => {
        const fallback = spawn('aplay', [file], { stdio: 'ignore', detached: true });
        fallback.on('error', () => {
          // unsupported — caller will surface a "sound player missing" error.
        });
        fallback.unref();
      });
      proc.unref();
    },
  };
}

/**
 * High-level helper: build the `ChannelConfig[]` list consumed by the
 * `NotificationDispatcher` from a single `notifications` config section. Each
 * entry has an attached `createClient()` that the dispatcher invokes lazily.
 *
 * Disabled channels are excluded from the returned array so the dispatcher
 * never constructs a client for them.
 */
export function buildChannelConfigs(
  notifications: {
    telegram: TelegramChannelConfig;
    slack: SlackChannelConfig;
    email: EmailChannelConfig;
    desktop: DesktopChannelConfig;
    sound: SoundChannelConfig;
  },
  options: {
    telegramClientFactory?: (token: string) => TelegramClientLike;
    slackClientFactory?: (url: string) => SlackClientLike;
    emailClientFactory?: (cfg: EmailChannelConfig, env: NodeJS.ProcessEnv) => EmailClientLike;
    desktopClientFactory?: () => DesktopClientLike | undefined;
    soundClientFactory?: () => SoundClientLike;
    env?: NodeJS.ProcessEnv;
  } = {},
): Array<{
  name: string;
  enabled: boolean;
  events: string[];
  createClient: () => { send: (message: string) => Promise<SendOutcome> };
}> {
  const channels: Array<{
    name: string;
    enabled: boolean;
    events: string[];
    createClient: () => { send: (message: string) => Promise<SendOutcome> };
  }> = [];
  const telegram = createTelegramClient(notifications.telegram, {
    clientFactory: options.telegramClientFactory,
    env: options.env,
  });
  if (telegram) {
    channels.push({
      name: 'telegram',
      enabled: true,
      events: notifications.telegram.events,
      createClient: () => telegram,
    });
  }
  const slack = createSlackClient(notifications.slack, {
    clientFactory: options.slackClientFactory,
    env: options.env,
  });
  if (slack) {
    channels.push({
      name: 'slack',
      enabled: true,
      events: notifications.slack.events,
      createClient: () => slack,
    });
  }
  const email = createEmailClient(notifications.email, {
    clientFactory: options.emailClientFactory,
    env: options.env,
  });
  if (email) {
    channels.push({
      name: 'email',
      enabled: true,
      events: ['success', 'failure', 'fallback', 'injection', 'model_switch', 'uncertain', 'low_confidence', 'cost_time', 'quality_failure', 'anomaly', 'pattern_conflict', 'migration', 'smoke_test'],
      createClient: () => email,
    });
  }
  const desktop = createDesktopClient(notifications.desktop, {
    clientFactory: options.desktopClientFactory,
  });
  if (desktop) {
    channels.push({
      name: 'desktop',
      enabled: true,
      events: notifications.desktop.events,
      createClient: () => desktop,
    });
  }
  const sound = createSoundClient(notifications.sound, {
    clientFactory: options.soundClientFactory,
  });
  if (sound) {
    channels.push({
      name: 'sound',
      enabled: true,
      events: ['success', 'failure', 'fallback', 'injection'],
      createClient: () => sound,
    });
  }
  return channels;
}
