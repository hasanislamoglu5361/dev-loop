import * as fs from 'node:fs';
import * as path from 'node:path';
import { ConfigError } from '../errors.js';

export const DEV_LOOP_GITIGNORE_PATTERNS = [
  '.dev-loop/dev-loop.db',
  '.dev-loop/dev-loop.db-shm',
  '.dev-loop/dev-loop.db-wal',
  '.dev-loop/sandbox/',
  '.dev-loop/checkpoints/',
  '.dev-loop/logs/',
] as const;

export const DEV_LOOP_VSCODE_FILES_EXCLUDE = {
  '.dev-loop/dev-loop.db': true,
  '.dev-loop/dev-loop.db-shm': true,
  '.dev-loop/dev-loop.db-wal': true,
  '.dev-loop/sandbox': true,
  '.dev-loop/checkpoints': true,
  '.dev-loop/logs': true,
} as const;

export const DEV_LOOP_VSCODE_SEARCH_EXCLUDE = {
  '.dev-loop/sandbox/**': true,
  '.dev-loop/checkpoints/**': true,
  '.dev-loop/fine-tune-dataset.jsonl': true,
} as const;

const GITIGNORE_HEADER = '# dev-loop runtime data - do not commit';
const GITIGNORE_COMMIT_NOTE = [
  '# Commit these dev-loop files:',
  '# dev-loop.yaml',
  '# .dev-loop/FEATURES.md',
  '# .dev-loop/BUGS.md',
  '# .dev-loop/CODE_MAP.md',
  '# .dev-loop/DECISIONS.md',
  '# .dev-loop/PATTERNS.md',
];

function writeFileAtomicSync(filePath: string, content: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tempPath = path.join(path.dirname(filePath), `.${path.basename(filePath)}.${process.pid}.tmp`);
  try {
    fs.writeFileSync(tempPath, content, 'utf-8');
    fs.renameSync(tempPath, filePath);
  } catch (error) {
    try {
      fs.rmSync(tempPath, { force: true });
    } catch {
      // Best-effort cleanup only.
    }
    throw error;
  }
}

function readFileIfExists(filePath: string): string {
  if (!fs.existsSync(filePath)) return '';
  return fs.readFileSync(filePath, 'utf-8');
}

function hasLine(content: string, line: string): boolean {
  return content
    .split(/\r?\n/)
    .map(value => value.trim())
    .includes(line);
}

export function mergeGitignore(projectDir: string): string {
  const gitignorePath = path.join(projectDir, '.gitignore');
  const existing = readFileIfExists(gitignorePath);
  const linesToAdd: string[] = [];

  if (!hasLine(existing, GITIGNORE_HEADER)) {
    linesToAdd.push(GITIGNORE_HEADER);
  }

  for (const pattern of DEV_LOOP_GITIGNORE_PATTERNS) {
    if (!hasLine(existing, pattern)) {
      linesToAdd.push(pattern);
    }
  }

  for (const note of GITIGNORE_COMMIT_NOTE) {
    if (!hasLine(existing, note)) {
      linesToAdd.push(note);
    }
  }

  if (linesToAdd.length === 0) {
    return gitignorePath;
  }

  const prefix = existing.length > 0 ? existing.replace(/\s*$/, '\n\n') : '';
  writeFileAtomicSync(gitignorePath, `${prefix}${linesToAdd.join('\n')}\n`);
  return gitignorePath;
}

function readSettings(settingsPath: string): Record<string, unknown> {
  const source = readFileIfExists(settingsPath);
  if (source.trim().length === 0) return {};

  try {
    const parsed = JSON.parse(source) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('settings.json must contain a JSON object.');
    }
    return parsed as Record<string, unknown>;
  } catch (error) {
    throw new ConfigError(
      'Invalid VS Code settings JSON.',
      'Fix .vscode/settings.json so it contains a valid JSON object, then run dev-loop init again.',
      { path: settingsPath },
      error instanceof Error ? error : undefined,
    );
  }
}

function objectSetting(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

export function mergeVSCodeSettings(projectDir: string): string {
  const settingsPath = path.join(projectDir, '.vscode', 'settings.json');
  const settings = readSettings(settingsPath);

  settings['files.exclude'] = {
    ...objectSetting(settings['files.exclude']),
    ...DEV_LOOP_VSCODE_FILES_EXCLUDE,
  };
  settings['search.exclude'] = {
    ...objectSetting(settings['search.exclude']),
    ...DEV_LOOP_VSCODE_SEARCH_EXCLUDE,
  };

  writeFileAtomicSync(settingsPath, `${JSON.stringify(settings, null, 2)}\n`);
  return settingsPath;
}
