import * as fs from 'node:fs/promises';
import { globFiles } from './file-system.js';
import { resolveProjectPath } from './path-safety.js';
import { REDACTED } from './redaction.js';

export type SecretKind = 'api_key' | 'token' | 'password' | 'webhook_url' | 'authorization';

export interface SecretFinding {
  filePath: string;
  line: number;
  column: number;
  kind: SecretKind;
  redactedValue: typeof REDACTED;
}

export interface SecretScanOptions {
  projectDir: string;
  changedFiles?: string[];
}

export interface SecretScanResult {
  blocked: boolean;
  findings: SecretFinding[];
}

interface SecretPattern {
  kind: SecretKind;
  regex: RegExp;
}

const SECRET_PATTERNS: SecretPattern[] = [
  { kind: 'api_key', regex: /\bsk-[A-Za-z0-9_-]{20,}\b/g },
  { kind: 'token', regex: /\bgh[pousr]_[A-Za-z0-9_]{20,}\b/g },
  { kind: 'authorization', regex: /\bBearer\s+[A-Za-z0-9._~+/=-]{12,}\b/gi },
  { kind: 'webhook_url', regex: /https:\/\/hooks\.slack\.com\/services\/[A-Za-z0-9/._-]+/gi },
];

const KEY_VALUE_PATTERN =
  /\b(api[_-]?key|apikey|token|password|webhook[_-]?url|authorization)\b\s*[:=]\s*["']([^"']+)["']/gi;

export async function scanSecrets(options: SecretScanOptions): Promise<SecretScanResult> {
  const files = await filesToScan(options);
  const findings: SecretFinding[] = [];

  for (const filePath of files) {
    const resolved = resolveProjectPath(options.projectDir, filePath);
    const content = await fs.readFile(resolved.absolutePath, 'utf8');
    findings.push(...scanContent(resolved.relativePath, content));
  }

  return {
    blocked: findings.length > 0,
    findings,
  };
}

async function filesToScan(options: SecretScanOptions): Promise<string[]> {
  const files = options.changedFiles
    ? options.changedFiles.map(file => file.replaceAll('\\', '/'))
    : await globFiles('**/*', {
        cwd: options.projectDir,
        dot: true,
        excludeGenerated: true,
      });

  return files
    .filter(file => !isIgnoredPath(file))
    .sort();
}

function scanContent(filePath: string, content: string): SecretFinding[] {
  const findings: SecretFinding[] = [];
  const lines = content.split(/\r?\n/);

  for (const [index, line] of lines.entries()) {
    findings.push(...scanKeyValueLine(filePath, index + 1, line));
    findings.push(...scanPatternLine(filePath, index + 1, line));
  }

  return dedupeFindings(findings);
}

function scanKeyValueLine(filePath: string, lineNumber: number, line: string): SecretFinding[] {
  const findings: SecretFinding[] = [];

  for (const match of line.matchAll(KEY_VALUE_PATTERN)) {
    const rawKey = match[1] ?? '';
    const rawValue = match[2] ?? '';
    if (isAllowedPlaceholder(rawValue) || !looksSensitiveValue(rawValue)) continue;

    findings.push({
      filePath,
      line: lineNumber,
      column: (match.index ?? 0) + match[0].indexOf(rawValue) + 1,
      kind: kindFromKey(rawKey),
      redactedValue: REDACTED,
    });
  }

  return findings;
}

function scanPatternLine(filePath: string, lineNumber: number, line: string): SecretFinding[] {
  const findings: SecretFinding[] = [];

  for (const pattern of SECRET_PATTERNS) {
    for (const match of line.matchAll(pattern.regex)) {
      const rawValue = match[0] ?? '';
      if (isAllowedPlaceholder(rawValue)) continue;

      findings.push({
        filePath,
        line: lineNumber,
        column: (match.index ?? 0) + 1,
        kind: pattern.kind,
        redactedValue: REDACTED,
      });
    }
  }

  return findings;
}

function kindFromKey(key: string): SecretKind {
  const normalized = key.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (normalized.includes('password')) return 'password';
  if (normalized.includes('webhook')) return 'webhook_url';
  if (normalized.includes('authorization')) return 'authorization';
  if (normalized.includes('apikey')) return 'api_key';
  return 'token';
}

function looksSensitiveValue(value: string): boolean {
  if (value.length < 12) return false;
  if (isAllowedPlaceholder(value)) return false;
  return true;
}

function isAllowedPlaceholder(value: string): boolean {
  return /^\$\{[A-Z][A-Z0-9_]*\}$/.test(value.trim());
}

function isIgnoredPath(filePath: string): boolean {
  return filePath
    .split('/')
    .some(part => ['node_modules', 'dist', 'coverage', '.turbo', '.git'].includes(part));
}

function dedupeFindings(findings: SecretFinding[]): SecretFinding[] {
  const seen = new Set<string>();
  const deduped: SecretFinding[] = [];

  for (const finding of findings) {
    const key = `${finding.filePath}:${finding.line}:${finding.column}:${finding.kind}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(finding);
  }

  return deduped;
}
