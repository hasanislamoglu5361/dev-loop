import * as fs from 'node:fs/promises';
import * as path from 'node:path';

export interface UncertainDetectionOptions {
  tag?: string;
  ignoredDirectories?: string[];
}

export interface UncertainTag {
  file: string;
  line: number;
  snippet: string;
  note: string;
  tag: string;
}

const DEFAULT_TAG = 'TODO:UNCERTAIN';
const DEFAULT_IGNORED_DIRS = new Set(['node_modules', '.git', 'dist', 'coverage', '.turbo']);

export async function detectUncertainInPath(
  targetPath: string,
  options: UncertainDetectionOptions = {},
): Promise<UncertainTag[]> {
  const stat = await fs.stat(targetPath);
  if (stat.isFile()) return detectUncertainInFiles([targetPath], options);

  const files = await collectFiles(targetPath, options);
  return detectUncertainInFiles(files, options);
}

export async function detectUncertainInFiles(
  files: string[],
  options: UncertainDetectionOptions = {},
): Promise<UncertainTag[]> {
  const results: UncertainTag[] = [];
  for (const file of files) {
    const content = await fs.readFile(file, 'utf8');
    results.push(...detectUncertainInContent(content, file, options));
  }
  return results;
}

export function detectUncertainInContent(
  content: string,
  file: string,
  options: UncertainDetectionOptions = {},
): UncertainTag[] {
  const tag = options.tag ?? DEFAULT_TAG;
  const results: UncertainTag[] = [];

  content.split(/\r?\n/).forEach((line, index) => {
    let offset = 0;
    while (offset <= line.length) {
      const found = line.indexOf(tag, offset);
      if (found === -1) break;
      const note = line.slice(found + tag.length).trim().replace(/^\W+/, '').trim();
      results.push({
        file,
        line: index + 1,
        snippet: line.trim(),
        note,
        tag,
      });
      offset = found + tag.length;
    }
  });

  return results;
}

async function collectFiles(root: string, options: UncertainDetectionOptions): Promise<string[]> {
  const ignored = new Set([...(options.ignoredDirectories ?? []), ...DEFAULT_IGNORED_DIRS]);
  const entries = await fs.readdir(root, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      if (ignored.has(entry.name)) continue;
      files.push(...await collectFiles(fullPath, options));
    } else if (entry.isFile()) {
      files.push(fullPath);
    }
  }

  return files.sort();
}
