import fs from 'node:fs';
import { writeFileAtomic } from '../utils/file-system.js';
import { redactFreeText } from '../utils/redaction.js';

export interface PromptVersionRecord {
  id: string;
  name: string;
  content: string;
  active: boolean;
  sampleCount: number;
  successCount: number;
  successRate: number;
  retiredAt?: string;
}

export interface RecordPromptSampleOptions {
  promptId: string;
  success: boolean;
}

export interface FineTuneMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface FineTuneLoopRecord {
  loopId: string;
  success: boolean;
  messages: FineTuneMessage[];
  includeFailed?: boolean;
}

export interface ExportFineTuneJsonlOptions {
  enabled: boolean;
  outputPath: string;
  records: FineTuneLoopRecord[];
  overwrite?: boolean;
  append?: boolean;
}

export interface ExportFineTuneJsonlResult {
  exported: number;
  skipped: number;
  outputPath: string;
}

export function getActivePromptVersion(
  versions: PromptVersionRecord[],
): PromptVersionRecord | undefined {
  return versions
    .filter(version => version.active && !version.retiredAt)
    .sort((a, b) => b.successRate - a.successRate || b.sampleCount - a.sampleCount || a.id.localeCompare(b.id))[0];
}

export function retirePromptVersion(
  versions: PromptVersionRecord[],
  promptId: string,
  retiredAt = new Date().toISOString(),
): PromptVersionRecord[] {
  return versions
    .map(version => version.id === promptId
      ? { ...version, active: false, retiredAt }
      : version)
    .sort((a, b) => a.id.localeCompare(b.id));
}

export function recordPromptSample(
  versions: PromptVersionRecord[],
  options: RecordPromptSampleOptions,
): PromptVersionRecord[] {
  return versions
    .map(version => {
      if (version.id !== options.promptId) {
        return version;
      }

      const sampleCount = version.sampleCount + 1;
      const successCount = version.successCount + (options.success ? 1 : 0);

      return {
        ...version,
        sampleCount,
        successCount,
        successRate: round(successCount / sampleCount),
      };
    })
    .sort((a, b) => a.id.localeCompare(b.id));
}

export async function exportFineTuneJsonl(
  options: ExportFineTuneJsonlOptions,
): Promise<ExportFineTuneJsonlResult> {
  if (!options.enabled) {
    return { exported: 0, skipped: options.records.length, outputPath: options.outputPath };
  }

  if (fs.existsSync(options.outputPath) && !options.overwrite && !options.append) {
    throw new Error(`Refusing to overwrite existing JSONL file: ${options.outputPath}`);
  }

  const lines: string[] = [];
  let skipped = 0;

  for (const record of options.records) {
    if (!record.success && !record.includeFailed) {
      skipped += 1;
      continue;
    }

    if (!isValidConversation(record.messages)) {
      skipped += 1;
      continue;
    }

    lines.push(JSON.stringify({
      messages: record.messages.map(message => ({
        role: message.role,
        content: redactPromptText(message.content),
      })),
      metadata: { loopId: record.loopId },
    }));
  }

  const content = lines.length > 0 ? `${lines.join('\n')}\n` : '';
  if (options.append && fs.existsSync(options.outputPath)) {
    fs.appendFileSync(options.outputPath, content);
  } else {
    await writeFileAtomic(options.outputPath, content);
  }

  return {
    exported: lines.length,
    skipped,
    outputPath: options.outputPath,
  };
}

function isValidConversation(messages: FineTuneMessage[]): boolean {
  return messages.length > 0 &&
    messages.every(message => message.content.trim().length > 0) &&
    messages.some(message => message.role === 'assistant');
}

function redactPromptText(value: string): string {
  return redactFreeText(value);
}

function round(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}
