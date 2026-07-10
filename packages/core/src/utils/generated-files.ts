import path from 'node:path';
import type { GeneratedFile } from '../types.js';

export interface ParsedGeneratedFiles {
  text: string;
  files: GeneratedFile[];
}

interface FileMarker {
  path: string;
}

export class GeneratedFileParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GeneratedFileParseError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/** Parse model Markdown output into explanatory text plus safe generated files. */
export function parseGeneratedFiles(output: string): ParsedGeneratedFiles {
  const lines = output.split(/\r?\n/);
  const textLines: string[] = [];
  const files: GeneratedFile[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? '';
    const fence = parseFenceStart(line);

    if (fence !== null) {
      const end = findFenceEnd(lines, index + 1);
      if (end === -1) {
        throw new GeneratedFileParseError('Malformed generated file output: missing closing Markdown fence.');
      }

      const body = lines.slice(index + 1, end);
      const markerIndex = body.findIndex(value => isFileMarkerLine(value));

      if (markerIndex === -1) {
        textLines.push(...lines.slice(index, end + 1));
        index = end;
        continue;
      }

      const marker = parseFileMarker(body[markerIndex] ?? '');
      const contentLines = body.slice(markerIndex + 1);
      files.push(createGeneratedFile(marker.path, contentLines, fence.language));
      index = end;
      continue;
    }

    if (isFileMarkerLine(line)) {
      const marker = parseFileMarker(line);
      const contentLines: string[] = [];

      for (index += 1; index < lines.length; index += 1) {
        const nextLine = lines[index] ?? '';
        if (isFileMarkerLine(nextLine) || parseFenceStart(nextLine) !== null) {
          index -= 1;
          break;
        }
        contentLines.push(nextLine);
      }

      files.push(createGeneratedFile(marker.path, contentLines));
      continue;
    }

    textLines.push(line);
  }

  return {
    text: normalizeText(textLines),
    files,
  };
}

function parseFenceStart(line: string): { language?: string } | null {
  const match = line.match(/^\s*```([^\s`]*)?.*$/);
  if (!match) {
    return null;
  }

  const language = match[1]?.trim();
  return language ? { language } : {};
}

function findFenceEnd(lines: string[], start: number): number {
  for (let index = start; index < lines.length; index += 1) {
    if (/^\s*```\s*$/.test(lines[index] ?? '')) {
      return index;
    }
  }

  return -1;
}

function isFileMarkerLine(line: string): boolean {
  return /^\s*(?:(?:\/\/)|#)\s*FILE\s*:/.test(line);
}

function parseFileMarker(line: string): FileMarker {
  const match = line.match(/^\s*(?:(?:\/\/)|#)\s*FILE\s*:\s*(.*?)\s*$/);
  if (!match) {
    throw new GeneratedFileParseError('Malformed generated file output: expected FILE marker.');
  }

  const rawPath = match[1]?.trim();
  if (!rawPath) {
    throw new GeneratedFileParseError('Malformed generated file output: missing file path after FILE marker.');
  }

  return { path: normalizeGeneratedPath(rawPath) };
}

function createGeneratedFile(rawPath: string, contentLines: string[], language?: string): GeneratedFile {
  return {
    path: rawPath,
    content: contentLines.length === 0 ? '' : `${contentLines.join('\n')}\n`,
    language,
    overwrite: true,
  };
}

function normalizeGeneratedPath(rawPath: string): string {
  const slashPath = rawPath.replaceAll('\\', '/');
  const normalized = path.posix.normalize(slashPath);

  if (
    normalized === '' ||
    normalized === '.' ||
    normalized.endsWith('/') ||
    path.posix.isAbsolute(normalized) ||
    /^[A-Za-z]:\//.test(normalized) ||
    normalized === '..' ||
    normalized.startsWith('../') ||
    normalized.includes('/../')
  ) {
    throw new GeneratedFileParseError(`Unsafe generated file path: ${rawPath}`);
  }

  return normalized.replace(/^\.\//, '');
}

function normalizeText(lines: string[]): string {
  return lines
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
