import path from 'node:path';
import { globFiles, readFileSafe } from '../utils/file-system.js';

export interface SemanticSearchVectorizer {
  embed(text: string): number[] | undefined;
}

export interface IndexProjectFilesOptions {
  projectDir: string;
  patterns?: string[];
  maxFileBytes?: number;
  vectorizer?: SemanticSearchVectorizer;
}

export interface SearchIndexFile {
  path: string;
  content: string;
  tokens: string[];
  vector?: number[];
}

export interface SearchIndex {
  mode: 'keyword' | 'vector';
  files: SearchIndexFile[];
}

export interface QueryRelevantFilesOptions {
  query: string;
  topK: number;
  tokenBudget?: number;
}

export interface RelevantFileResult {
  path: string;
  score: number;
  content: string;
}

const DEFAULT_PATTERNS = ['**/*.{ts,tsx,js,jsx,md,json}'];
const DEFAULT_MAX_FILE_BYTES = 128 * 1024;
const DEFAULT_IGNORES = [
  '**/node_modules/**',
  '**/dist/**',
  '**/coverage/**',
  '**/.turbo/**',
  '**/.git/**',
  '**/.dev-loop/**',
];

export async function indexProjectFiles(options: IndexProjectFilesOptions): Promise<SearchIndex> {
  const projectDir = path.resolve(options.projectDir);
  const maxFileBytes = options.maxFileBytes ?? DEFAULT_MAX_FILE_BYTES;
  const files = await globFiles(options.patterns ?? DEFAULT_PATTERNS, {
    cwd: projectDir,
    dot: true,
    ignore: DEFAULT_IGNORES,
  });
  const indexedFiles: SearchIndexFile[] = [];
  let vectorMode = Boolean(options.vectorizer);

  for (const file of files) {
    const absolutePath = path.join(projectDir, file);
    const content = await readFileSafe(absolutePath);

    if (Buffer.byteLength(content, 'utf8') > maxFileBytes) {
      continue;
    }

    const vector = options.vectorizer?.embed(content);
    if (options.vectorizer && vector === undefined) {
      vectorMode = false;
    }

    indexedFiles.push({
      path: file,
      content,
      tokens: tokenize(`${file} ${content}`),
      vector,
    });
  }

  return {
    mode: vectorMode ? 'vector' : 'keyword',
    files: indexedFiles.sort((a, b) => a.path.localeCompare(b.path)),
  };
}

export function queryRelevantFiles(
  index: SearchIndex,
  options: QueryRelevantFilesOptions,
): RelevantFileResult[] {
  const queryTokens = tokenize(options.query);
  const scored = index.files
    .map(file => ({
      path: file.path,
      content: file.content,
      score: scoreKeywordMatch(queryTokens, file.tokens),
    }))
    .filter(result => result.score > 0)
    .sort((a, b) => b.score - a.score || a.path.localeCompare(b.path));

  const limited = scored.slice(0, Math.max(options.topK, 0));
  if (options.tokenBudget === undefined) {
    return limited;
  }

  const results: RelevantFileResult[] = [];
  let usedTokens = 0;
  for (const result of limited) {
    const cost = tokenize(result.content).length;
    if (usedTokens + cost > options.tokenBudget) {
      continue;
    }
    usedTokens += cost;
    results.push(result);
  }

  return results;
}

function scoreKeywordMatch(queryTokens: string[], fileTokens: string[]): number {
  const counts = new Map<string, number>();
  for (const token of fileTokens) {
    counts.set(token, (counts.get(token) ?? 0) + 1);
  }

  return queryTokens.reduce((score, token) => score + (counts.get(token) ?? 0), 0);
}

function tokenize(content: string): string[] {
  return content
    .toLowerCase()
    .split(/[^a-z0-9_]+/i)
    .filter(token => token.length > 1);
}
