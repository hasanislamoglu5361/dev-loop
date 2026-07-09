// packages/core/src/config/errors.ts
// Actionable configuration validation error reporting helper.

import * as fs from 'node:fs';
import * as path from 'node:path';
import { z } from 'zod';
import { parseYamlObject } from './parse.js';
import { ConfigSchema, type DevLoopConfig } from './schema.js';

/** Secret-like key names that must be redacted from error output */
const SECRET_KEY_PATTERNS = new Set([
  'api_key', 'apikey', 'secret', 'token', 'password', 'webhook_url',
]);

function isSecretKey(key: string): boolean {
  const normalized = key.toLowerCase().replace(/[^a-z0-9]/g, '');
  return SECRET_KEY_PATTERNS.has(normalized);
}

function redactValue(value: unknown): string {
  if (typeof value === 'string' && value.length > 6) return '<redacted>';
  return String(value);
}

/**
 * Suggest an actionable fix for a single Zod issue based on its code.
 * This is the piece the acceptance criteria call "suggested fix" — kept
 * separate from `formatIssue` so it can be reasoned about on its own.
 */
function suggestFix(issue: z.ZodIssue): string {
  switch (issue.code) {
    case 'invalid_enum_value':
      return `use one of: ${issue.options.join(', ')}`;
    case 'invalid_type':
      return `provide a ${issue.expected} value`;
    case 'too_small':
      return `use a value >= ${issue.minimum}`;
    case 'too_big':
      return `use a value <= ${issue.maximum}`;
    case 'invalid_string':
      return 'use a valid string for this field';
    default:
      return 'fix the value at this path in dev-loop.yaml';
  }
}

interface FormattedIssue {
  path: string;
  received?: string;
  expected?: string;
  suggestedFix: string;
  message: string;
}

/**
 * Format a single Zod issue into an actionable message.
 * Includes path, received value summary, expected kind, and a suggested fix.
 */
function formatIssue(issue: z.ZodIssue): FormattedIssue {
  const path = issue.path.join('.');
  const lastPart = typeof issue.path[issue.path.length - 1] === 'string'
    ? (issue.path[issue.path.length - 1] as string)
    : '';

  // Redact secret-like keys and long strings.
  let received: string;
  if (isSecretKey(lastPart)) {
    received = '<redacted>';
  } else {
    received = redactValue((issue as { received?: unknown }).received);
  }

  const expected = issue.code === 'invalid_type' && issue.expected ? issue.expected : undefined;
  const fix = suggestFix(issue);

  let message = `${path}: invalid value`;
  if (received) message += `, got ${received}`;
  if (expected) message += `, expected ${expected}`;
  message += `; suggested fix: ${fix}`;

  return { path, received: received || undefined, expected, suggestedFix: fix, message };
}

export interface SafeParseResult<T> {
  success: boolean;
  message?: string;
  details?: Record<string, unknown>;
  data?: T;
}

/**
 * Parse a config object against a Zod schema and produce an actionable error report.
 * - Includes key path, received value summary, expected kind, and suggested fix.
 * - Redacts secret-like values from the message.
 */
export function safeParseWithMessage<T>(
  // Input is decoupled from Output (T) so schemas using `.default()` — whose
  // parsed input shape is a partial version of their fully-defaulted output —
  // remain assignable to this parameter.
  schema: z.ZodType<T, z.ZodTypeDef, any>,
  input: unknown,
): SafeParseResult<T> {
  const result = schema.safeParse(input);
  if (result.success) return { success: true, data: result.data };

  const formattedIssues = result.error.issues.map(formatIssue);

  return {
    success: false,
    message: `dev-loop.yaml failed validation:\n${formattedIssues.map(issue => issue.message).join('; ')}`,
    details: { issues: formattedIssues },
  };
}

export interface ConfigCheckResult extends SafeParseResult<DevLoopConfig> {
  configPath: string;
}

/**
 * Read and validate a project's `dev-loop.yaml`, returning the same actionable
 * report as `safeParseWithMessage` plus the resolved path that was checked.
 * This is the function CLI commands should call for "is my config valid?" flows —
 * it owns reading/parsing the file so callers do not reimplement that logic.
 */
export function checkConfigFile(projectDir: string, configPath?: string): ConfigCheckResult {
  const filePath = configPath ?? path.join(projectDir, 'dev-loop.yaml');

  if (!fs.existsSync(filePath)) {
    return { success: true, data: ConfigSchema.parse({}), configPath: filePath };
  }

  const rawContent = fs.readFileSync(filePath, 'utf-8');
  const parsed = parseYamlObject(rawContent, filePath);
  // Pin the generic explicitly: inferring T from ConfigSchema's z.ZodType<T>
  // constraint conflates the (partial) input shape with the (defaulted) output
  // shape and produces an all-optional type instead of DevLoopConfig.
  const result = safeParseWithMessage<DevLoopConfig>(ConfigSchema, parsed);

  return { ...result, configPath: filePath };
}