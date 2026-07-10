import * as fs from 'node:fs/promises';
import { writeFileAtomic } from '../../utils/file-system.js';
import { REDACTED, redactSecrets } from '../../utils/redaction.js';

export interface KnownErrorPattern {
  title: string;
  warning: string;
  [key: string]: unknown;
}

export interface EnrichmentEffortEstimate {
  level: 'low' | 'medium' | 'high';
  reason: string;
}

export interface EnrichFeatureFileOptions {
  featurePath: string;
  knownPatterns?: KnownErrorPattern[];
  mcpSuggestions?: string[];
  affectedFiles?: string[];
  effort?: EnrichmentEffortEstimate;
  maxPatterns?: number;
}

const START = '<!-- dev-loop:auto-enriched:start -->';
const END = '<!-- dev-loop:auto-enriched:end -->';

export async function enrichFeatureFile(options: EnrichFeatureFileOptions): Promise<void> {
  const original = await fs.readFile(options.featurePath, 'utf8');
  const withoutOld = stripAutoSection(original);
  const section = buildAutoEnrichedSection(options);
  await writeFileAtomic(options.featurePath, `${withoutOld.trimEnd()}\n\n${section}\n`);
}

export function buildAutoEnrichedSection(options: EnrichFeatureFileOptions): string {
  const maxPatterns = options.maxPatterns ?? 5;
  const patterns = (options.knownPatterns ?? []).slice(0, maxPatterns).map(pattern => redactPattern(pattern));

  return [
    START,
    '## Auto-Enriched Verifier Context',
    '',
    '### Known Error Patterns',
    patterns.length > 0
      ? patterns.map(pattern => `- ${pattern.title}: ${pattern.warning}`).join('\n')
      : '- None found.',
    '',
    '### MCP Suggestions',
    (options.mcpSuggestions ?? []).length > 0
      ? (options.mcpSuggestions ?? []).map(value => `- ${sanitize(value)}`).join('\n')
      : '- None.',
    '',
    '### Affected Files Estimate',
    (options.affectedFiles ?? []).length > 0
      ? (options.affectedFiles ?? []).map(value => `- ${sanitize(value)}`).join('\n')
      : '- None.',
    '',
    '### Effort Estimate',
    options.effort
      ? `- ${options.effort.level}: ${sanitize(options.effort.reason)}`
      : '- unknown: No effort estimate available.',
    END,
  ].join('\n');
}

function stripAutoSection(content: string): string {
  const start = content.indexOf(START);
  const end = content.indexOf(END);
  if (start === -1 || end === -1 || end < start) return content;
  return `${content.slice(0, start)}${content.slice(end + END.length)}`;
}

function redactPattern(pattern: KnownErrorPattern): { title: string; warning: string } {
  const redacted = redactSecrets(pattern) as Record<string, unknown>;
  const hasRedactedDetails = JSON.stringify(redacted).includes(REDACTED);
  return {
    title: sanitize(String(redacted.title ?? 'Untitled pattern')),
    warning: `${sanitize(String(redacted.warning ?? 'No warning provided.'))}${hasRedactedDetails ? ` (${REDACTED} details omitted)` : ''}`,
  };
}

function sanitize(value: string): string {
  return value.includes(REDACTED) ? value : String(redactSecrets(value));
}
