// packages/core/src/context/init-runtime.ts
// Project Runtime Directory Initialization for dev-loop
// Creates the .dev-loop/ runtime structure used by the CLI, DB, and logging subsystems.
// Idempotent: safe to call multiple times without corrupting existing content.

import * as fsSync from 'node:fs';
import * as path from 'path';

/** Well-known files in .dev-loop/. Created if missing; never overwritten if user content exists. */
const RUNTIME_FILES = {
  FEATURES: 'FEATURES.md',
  BUGS: 'BUGS.md',
  CODE_MAP: 'CODE_MAP.md',
  DECISIONS: 'DECISIONS.md',
  PATTERNS: 'PATTERNS.md',
} as const;

/** Well-known directories in .dev-loop/. Always created (idempotent). */
const RUNTIME_DIRS = {
  sandbox: 'sandbox',
  checkpoints: 'checkpoints',
  logs: 'logs',
} as const;

export interface InitResult {
  runtimeRoot: string;
  files: Record<keyof typeof RUNTIME_FILES, string>;
  dirs: Record<keyof typeof RUNTIME_DIRS, string>;
}

/** Compute normalized .dev-loop/ paths for the given project directory. */
export function buildProjectRuntimePaths(projectDir: string): InitResult {
  const runtimeRoot = path.join(projectDir, '.dev-loop');
  const files: Record<keyof typeof RUNTIME_FILES, string> = {} as Record<keyof typeof RUNTIME_FILES, string>;
  for (const [key, name] of Object.entries(RUNTIME_FILES) as Array<[keyof typeof RUNTIME_FILES, string]>) {
    files[key] = path.join(runtimeRoot, name);
  }
  const dirs: Record<keyof typeof RUNTIME_DIRS, string> = {} as Record<keyof typeof RUNTIME_DIRS, string>;
  for (const [key, name] of Object.entries(RUNTIME_DIRS) as Array<[keyof typeof RUNTIME_DIRS, string]>) {
    dirs[key] = path.join(runtimeRoot, name);
  }
  return { runtimeRoot, files, dirs };
}

/** Default content for each .md file — only written when the file does not already exist. */
const DEFAULT_FILE_CONTENTS: Record<keyof typeof RUNTIME_FILES, string> = {
  FEATURES: '# Dev-Loop Features\n',
  BUGS: '# Known Bugs\n',
  CODE_MAP: '# Code Map\n',
  DECISIONS: '# Decisions Log\n',
  PATTERNS: '# Patterns\n',
};

/**
 * Initialize the `.dev-loop/` runtime structure inside `projectDir`.
 *
 * - Creates the directory tree once; subsequent calls are no-ops for existing entries.
 * - Writes minimal markdown scaffolding into `.md` files only when they do not already exist,
 *   so user-authored content is never silently overwritten.
 * - Directories (`sandbox/`, `checkpoints/`, `logs/`) are always ensured regardless of contents.
 * - Uses cross-platform `path.join`; no hardcoded path separators.
 */
export function initProjectRuntime(projectDir: string): InitResult {
  const result = buildProjectRuntimePaths(projectDir);

  // Ensure the root .dev-loop directory exists (idempotent).
  fsSync.mkdirSync(result.runtimeRoot, { recursive: true });

  // Write default file scaffolding only if missing.
  for (const [key, filePath] of Object.entries(result.files) as Array<[keyof typeof RUNTIME_FILES, string]>) {
    const content = DEFAULT_FILE_CONTENTS[key];
    if (!fsSync.existsSync(filePath)) {
      fsSync.writeFileSync(filePath, content, 'utf-8');
    }
  }

  // Ensure sub-directories exist (idempotent).
  for (const dirPath of Object.values(result.dirs)) {
    fsSync.mkdirSync(dirPath, { recursive: true });
  }

  return result;
}
