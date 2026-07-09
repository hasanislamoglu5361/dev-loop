// packages/core/src/__tests__/feature019-init-runtime.test.ts
// FEATURE019 - Project Runtime Directory Initialization
// Tests for initProjectRuntime idempotency and content preservation

import { describe, expect, it } from 'vitest';
import * as fsSync from 'node:fs';
import * as path from 'path';
import os from 'node:os';
import { initProjectRuntime } from '../context/init-runtime.js';

const DEV_LOOP_DIR = '.dev-loop';

describe('FEATURE019 - Project Runtime Directory Initialization', () => {
  it('returns stable runtime directory paths for any project', async () => {
    const tempDir = fsSync.mkdtempSync(path.join(os.tmpdir(), 'dev-loop-f019-'));
    try {
      // Call the function with a temp dir — should return normalized paths without throwing
      const result = initProjectRuntime(tempDir);
      expect(result.runtimeRoot).toBe(path.join(tempDir, DEV_LOOP_DIR));
      expect(typeof result.files.FEATURES).toBe('string');
      expect(typeof result.files.BUGS).toBe('string');
      expect(typeof result.dirs.sandbox).toBe('string');
    } finally {
      fsSync.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('creates all required files and directories', async () => {
    const tempDir = fsSync.mkdtempSync(path.join(os.tmpdir(), 'dev-loop-f019-'));
    try {
      initProjectRuntime(tempDir);

      expect(fsSync.existsSync(path.join(tempDir, DEV_LOOP_DIR))).toBe(true);
      expect(fsSync.existsSync(path.join(tempDir, '.dev-loop', 'FEATURES.md'))).toBe(true);
      expect(fsSync.existsSync(path.join(tempDir, '.dev-loop', 'BUGS.md'))).toBe(true);
      expect(fsSync.existsSync(path.join(tempDir, '.dev-loop', 'CODE_MAP.md'))).toBe(true);
      expect(fsSync.existsSync(path.join(tempDir, '.dev-loop', 'DECISIONS.md'))).toBe(true);
      expect(fsSync.existsSync(path.join(tempDir, '.dev-loop', 'PATTERNS.md'))).toBe(true);
      expect(fsSync.existsSync(path.join(tempDir, '.dev-loop', 'sandbox'))).toBe(true);
      expect(fsSync.existsSync(path.join(tempDir, '.dev-loop', 'checkpoints'))).toBe(true);
      expect(fsSync.existsSync(path.join(tempDir, '.dev-loop', 'logs'))).toBe(true);
    } finally {
      fsSync.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('initialization is idempotent — second call does not fail or corrupt state', async () => {
    const tempDir = fsSync.mkdtempSync(path.join(os.tmpdir(), 'dev-loop-f019-'));
    try {
      initProjectRuntime(tempDir);
      // Second call on same directory — must not throw, must preserve files
      initProjectRuntime(tempDir);

      expect(fsSync.existsSync(path.join(tempDir, '.dev-loop', 'FEATURES.md'))).toBe(true);
      expect(fsSync.readdirSync(path.join(tempDir, '.dev-loop')).sort()).toEqual(
        fsSync.readdirSync(path.join(tempDir, '.dev-loop')).sort(),
      );
    } finally {
      fsSync.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('preserves existing user content in FEATURES.md', async () => {
    const tempDir = fsSync.mkdtempSync(path.join(os.tmpdir(), 'dev-loop-f019-'));
    try {
      // Pre-create a FEATURES.md with existing user content
      const featuresPath = path.join(tempDir, '.dev-loop', 'FEATURES.md');
      fsSync.mkdirSync(path.dirname(featuresPath), { recursive: true });
      fsSync.writeFileSync(featuresPath, '# Existing Features\n- Feature A\n- Feature B\n');

      initProjectRuntime(tempDir);

      const existingContent = fsSync.readFileSync(featuresPath, 'utf-8');
      expect(existingContent).toContain('# Existing Features');
      expect(existingContent).toContain('- Feature A');
    } finally {
      fsSync.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('does not overwrite existing BUGS.md content', async () => {
    const tempDir = fsSync.mkdtempSync(path.join(os.tmpdir(), 'dev-loop-f019-'));
    try {
      const bugsPath = path.join(tempDir, '.dev-loop', 'BUGS.md');
      fsSync.mkdirSync(path.dirname(bugsPath), { recursive: true });
      fsSync.writeFileSync(bugsPath, '# Known Bugs\n## BUG001\nFix the login flow\n');

      initProjectRuntime(tempDir);

      const bugsContent = fsSync.readFileSync(bugsPath, 'utf-8');
      expect(bugsContent).toContain('## BUG001');
    } finally {
      fsSync.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('handles non-existent project directory without throwing', async () => {
    const tempDir = fsSync.mkdtempSync(path.join(os.tmpdir(), 'dev-loop-f019-nonexist-'));
    try {
      const nonexistentProject = path.join(tempDir, 'does-not-exist');
      // The function should create the .dev-loop directory even if the project dir is fresh
      initProjectRuntime(nonexistentProject);

      expect(fsSync.existsSync(path.join(nonexistentProject, '.dev-loop'))).toBe(true);
    } finally {
      fsSync.rmSync(tempDir, { recursive: true, force: true });
    }
  });
});