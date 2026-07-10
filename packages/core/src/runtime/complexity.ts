import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { globFiles } from '../utils/file-system.js';

export interface ComplexityMeasurement {
  maximum: number;
  files: Array<{ path: string; complexity: number }>;
}

export async function measureProjectComplexity(projectDir: string): Promise<ComplexityMeasurement> {
  const files = await globFiles('**/*.{ts,tsx,js,jsx}', {
    cwd: projectDir,
    dot: true,
    ignore: ['**/node_modules/**', '**/dist/**', '**/coverage/**', '**/.git/**', '**/.dev-loop/**'],
  });
  const measured = await Promise.all(files.map(async file => ({
    path: file,
    complexity: measureCyclomaticComplexity(await readFile(path.join(projectDir, file), 'utf8')),
  })));
  return { maximum: measured.reduce((max, file) => Math.max(max, file.complexity), 0), files: measured };
}

export function measureCyclomaticComplexity(source: string): number {
  const code = stripCommentsAndStrings(source);
  const branches = code.match(/\b(?:if|for|while|case|catch)\b|&&|\|\||\?(?![.?])/g)?.length ?? 0;
  return 1 + branches;
}

function stripCommentsAndStrings(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\/\/[^\n]*/g, ' ')
    .replace(/'(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"|`(?:\\.|[^`\\])*`/g, ' ');
}
