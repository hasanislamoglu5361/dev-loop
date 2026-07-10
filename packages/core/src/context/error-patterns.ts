import { createHash } from 'node:crypto';
import { redactSecrets } from '../utils/redaction.js';

export interface ErrorPatternBug {
  model: string;
  provider?: string;
  featureKeywords?: string[];
  language?: string;
  errorDescription: string;
  errorCategory?: string;
  fixDescription: string;
  fixExample?: string;
  versionContext?: string;
}

export interface ErrorPatternVersion {
  versionContext?: string;
  fixDescription: string;
}

export interface LearnedErrorPattern {
  patternHash: string;
  model: string;
  provider?: string;
  featureKeywords: string[];
  language?: string;
  errorDescription: string;
  errorCategory?: string;
  fixDescription: string;
  fixExample?: string;
  versionContext?: string;
  versionHistory: ErrorPatternVersion[];
  seenCount: number;
  firstSeen: string;
  lastSeen: string;
  active: boolean;
}

export interface LearnErrorPatternOptions {
  bug: ErrorPatternBug;
  now?: string;
}

export interface LearnErrorPatternResult {
  pattern: LearnedErrorPattern;
  patterns: LearnedErrorPattern[];
  created: boolean;
  conflict: boolean;
}

export interface BuildEvolvedSystemPromptOptions {
  basePrompt: string;
  patterns: LearnedErrorPattern[];
  limit?: number;
}

export function learnErrorPattern(
  patterns: LearnedErrorPattern[],
  options: LearnErrorPatternOptions,
): LearnErrorPatternResult {
  const now = options.now ?? new Date().toISOString();
  const patternHash = hashBug(options.bug);
  const existing = patterns.find(pattern => pattern.patternHash === patternHash);

  if (!existing) {
    const pattern = createPattern(options.bug, patternHash, now);
    return {
      pattern,
      patterns: [...patterns, pattern].sort(comparePatterns),
      created: true,
      conflict: false,
    };
  }

  const conflict = existing.fixDescription !== options.bug.fixDescription;
  const updated: LearnedErrorPattern = {
    ...existing,
    provider: options.bug.provider ?? existing.provider,
    featureKeywords: mergeKeywords(existing.featureKeywords, options.bug.featureKeywords ?? []),
    language: options.bug.language ?? existing.language,
    errorCategory: options.bug.errorCategory ?? existing.errorCategory,
    fixDescription: options.bug.fixDescription,
    fixExample: options.bug.fixExample ?? existing.fixExample,
    versionContext: options.bug.versionContext ?? existing.versionContext,
    versionHistory: conflict
      ? appendVersion(existing.versionHistory, {
          versionContext: options.bug.versionContext,
          fixDescription: options.bug.fixDescription,
        })
      : existing.versionHistory,
    seenCount: existing.seenCount + 1,
    lastSeen: now,
  };
  const next = patterns
    .map(pattern => pattern.patternHash === patternHash ? updated : pattern)
    .sort(comparePatterns);

  return {
    pattern: updated,
    patterns: next,
    created: false,
    conflict,
  };
}

export function buildEvolvedSystemPrompt(options: BuildEvolvedSystemPromptOptions): string {
  const activePatterns = options.patterns
    .filter(pattern => pattern.active)
    .sort((a, b) => b.seenCount - a.seenCount || b.lastSeen.localeCompare(a.lastSeen) || a.patternHash.localeCompare(b.patternHash))
    .slice(0, options.limit ?? 5);

  if (activePatterns.length === 0) {
    return options.basePrompt;
  }

  const lines = [
    options.basePrompt.trimEnd(),
    '',
    'Known error patterns:',
    ...activePatterns.map(pattern => {
      const redacted = redactSecrets({
        errorDescription: redactPromptSecrets(pattern.errorDescription),
        fixDescription: redactPromptSecrets(pattern.fixDescription),
      }) as { errorDescription: string; fixDescription: string };
      return `- ${redacted.errorDescription} Fix: ${redacted.fixDescription}`;
    }),
  ];

  return `${lines.join('\n')}\n`;
}

function createPattern(
  bug: ErrorPatternBug,
  patternHash: string,
  now: string,
): LearnedErrorPattern {
  return {
    patternHash,
    model: bug.model,
    provider: bug.provider,
    featureKeywords: [...(bug.featureKeywords ?? [])],
    language: bug.language,
    errorDescription: bug.errorDescription,
    errorCategory: bug.errorCategory,
    fixDescription: bug.fixDescription,
    fixExample: bug.fixExample,
    versionContext: bug.versionContext,
    versionHistory: [{
      versionContext: bug.versionContext,
      fixDescription: bug.fixDescription,
    }],
    seenCount: 1,
    firstSeen: now,
    lastSeen: now,
    active: true,
  };
}

function hashBug(bug: ErrorPatternBug): string {
  const normalized = `${bug.model}:${bug.errorDescription}`
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
  const hash = createHash('sha256').update(normalized).digest('hex').slice(0, 16);

  return `${bug.model}:${hash}`;
}

function mergeKeywords(existing: string[], next: string[]): string[] {
  return Array.from(new Set([...existing, ...next]));
}

function appendVersion(
  history: ErrorPatternVersion[],
  next: ErrorPatternVersion,
): ErrorPatternVersion[] {
  const normalized = [...history];
  const last = normalized.at(-1);
  if (last?.fixDescription === next.fixDescription && last.versionContext === next.versionContext) {
    return normalized;
  }

  normalized.push(next);
  return normalized;
}

function comparePatterns(a: LearnedErrorPattern, b: LearnedErrorPattern): number {
  return a.patternHash.localeCompare(b.patternHash);
}

function redactPromptSecrets(value: string): string {
  return value.replace(/\bsk-[A-Za-z0-9_-]+\b/g, '[REDACTED]');
}
