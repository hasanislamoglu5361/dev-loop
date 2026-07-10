export const REDACTED = '[REDACTED]';
const CIRCULAR = '[Circular]';

const SECRET_VALUE_PATTERNS = [
  /\bsk-[A-Za-z0-9_-]{20,}\b/,
  /\bgh[pousr]_[A-Za-z0-9_]{20,}\b/,
  /\bgithub_pat_[A-Za-z0-9_]{20,}\b/,
  /^https:\/\/hooks\.slack\.com\/services\/\S+$/i,
  /^Bearer\s+\S+$/i,
];

/**
 * Non-anchored, global counterparts of `SECRET_VALUE_PATTERNS` for scanning secrets
 * embedded anywhere inside free-form text (notification details, prompt/training
 * content, log lines) rather than matching a whole field value. The webhook/Bearer
 * patterns above are intentionally anchored (`^...$`) for exact-value field checks,
 * so they can't catch e.g. "Webhook failed: https://hooks.slack.com/..." — this list
 * fixes that for prose contexts.
 */
const SECRET_TEXT_SCAN_PATTERNS = [
  /\bsk-[A-Za-z0-9_-]{20,}\b/g,
  /\bgh[pousr]_[A-Za-z0-9_]{20,}\b/g,
  /\bgithub_pat_[A-Za-z0-9_]{20,}\b/g,
  /https:\/\/hooks\.slack\.com\/services\/\S+/gi,
  /\bBearer\s+\S+/gi,
];

/**
 * Redact secret-shaped substrings found anywhere within free text, leaving the
 * surrounding text intact. Use this for prose (notification detail/title, exported
 * prompt/training content) where `redactSecrets`/`safeJsonStringify`'s whole-value
 * field redaction is too coarse (or too narrow, for the anchored URL/Bearer shapes).
 */
export function redactFreeText(text: string): string {
  let result = text;
  for (const pattern of SECRET_TEXT_SCAN_PATTERNS) {
    result = result.replace(pattern, REDACTED);
  }
  return result;
}

export function redactSecrets<T>(value: T): unknown {
  return redactUnknown(value, new WeakMap<object, unknown>());
}

/** JSON.stringify wrapper that redacts secrets and replaces circular references. */
export function safeJsonStringify(value: unknown, space?: number): string {
  return JSON.stringify(redactSecrets(value), null, space);
}

/** Detect secret-bearing field names without matching harmless token-count fields. */
export function isSecretKey(key: string): boolean {
  const normalized = key.toLowerCase().replace(/[^a-z0-9]/g, '');

  if (
    normalized.includes('apikey') ||
    normalized.includes('password') ||
    normalized.includes('secret') ||
    normalized.includes('authorization') ||
    normalized.includes('webhook')
  ) {
    return true;
  }

  return normalized === 'token' || (normalized.endsWith('token') && !normalized.endsWith('tokens'));
}

function redactUnknown(value: unknown, seen: WeakMap<object, unknown>, key?: string): unknown {
  if (key && isSecretKey(key)) {
    return REDACTED;
  }

  if (typeof value === 'string') {
    return isSecretValue(value) ? REDACTED : value;
  }

  if (value === null || typeof value !== 'object') {
    return value;
  }

  if (seen.has(value)) {
    return CIRCULAR;
  }

  if (Array.isArray(value)) {
    const result: unknown[] = [];
    seen.set(value, result);
    for (const item of value) {
      result.push(redactUnknown(item, seen));
    }
    return result;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  const result: Record<string, unknown> = {};
  seen.set(value, result);

  for (const [entryKey, entryValue] of Object.entries(value)) {
    result[entryKey] = redactUnknown(entryValue, seen, entryKey);
  }

  return result;
}

function isSecretValue(value: string): boolean {
  return SECRET_VALUE_PATTERNS.some(pattern => pattern.test(value));
}
