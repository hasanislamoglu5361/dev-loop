import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { ConfigError } from '../errors.js';
import {
  mergeGitignore,
  mergeVSCodeSettings,
} from '../context/init-editor-support.js';

function makeTempProject(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'dev-loop-f020-'));
}

function readText(filePath: string): string {
  return fs.readFileSync(filePath, 'utf-8');
}

function countExactLine(content: string, line: string): number {
  return content
    .split(/\r?\n/)
    .filter(value => value.trim() === line).length;
}

describe('FEATURE020 - Gitignore and VS Code Settings Helpers', () => {
  it('creates .gitignore with dev-loop runtime exclusions without ignoring commit files', () => {
    const projectDir = makeTempProject();
    try {
      mergeGitignore(projectDir);

      const content = readText(path.join(projectDir, '.gitignore'));
      expect(content).toContain('.dev-loop/dev-loop.db');
      expect(content).toContain('.dev-loop/dev-loop.db-shm');
      expect(content).toContain('.dev-loop/dev-loop.db-wal');
      expect(content).toContain('.dev-loop/sandbox/');
      expect(content).toContain('.dev-loop/checkpoints/');
      expect(content).toContain('.dev-loop/logs/');
      expect(content).not.toMatch(/^\s*\.dev-loop\/\s*$/m);
      expect(content).not.toMatch(/^\s*\.dev-loop\/FEATURES\.md\s*$/m);
      expect(content).not.toMatch(/^\s*\.dev-loop\/BUGS\.md\s*$/m);
    } finally {
      fs.rmSync(projectDir, { recursive: true, force: true });
    }
  });

  it('merges .gitignore without deleting user entries or duplicating dev-loop patterns', () => {
    const projectDir = makeTempProject();
    try {
      const gitignorePath = path.join(projectDir, '.gitignore');
      fs.writeFileSync(gitignorePath, 'node_modules/\n.env\n.dev-loop/dev-loop.db\n', 'utf-8');

      mergeGitignore(projectDir);
      mergeGitignore(projectDir);

      const content = readText(gitignorePath);
      expect(content).toContain('node_modules/');
      expect(content).toContain('.env');
      expect(countExactLine(content, '.dev-loop/dev-loop.db')).toBe(1);
      expect(countExactLine(content, '.dev-loop/sandbox/')).toBe(1);
      expect(countExactLine(content, '.dev-loop/logs/')).toBe(1);
    } finally {
      fs.rmSync(projectDir, { recursive: true, force: true });
    }
  });

  it('creates VS Code settings with file and search exclusions', () => {
    const projectDir = makeTempProject();
    try {
      mergeVSCodeSettings(projectDir);

      const settingsPath = path.join(projectDir, '.vscode', 'settings.json');
      const settings = JSON.parse(readText(settingsPath)) as {
        'files.exclude': Record<string, boolean>;
        'search.exclude': Record<string, boolean>;
      };

      expect(settings['files.exclude']).toEqual(expect.objectContaining({
        '.dev-loop/dev-loop.db': true,
        '.dev-loop/dev-loop.db-shm': true,
        '.dev-loop/dev-loop.db-wal': true,
        '.dev-loop/sandbox': true,
        '.dev-loop/checkpoints': true,
        '.dev-loop/logs': true,
      }));
      expect(settings['search.exclude']).toEqual(expect.objectContaining({
        '.dev-loop/sandbox/**': true,
        '.dev-loop/checkpoints/**': true,
        '.dev-loop/fine-tune-dataset.jsonl': true,
      }));
    } finally {
      fs.rmSync(projectDir, { recursive: true, force: true });
    }
  });

  it('merges VS Code settings without overwriting user settings', () => {
    const projectDir = makeTempProject();
    try {
      const settingsPath = path.join(projectDir, '.vscode', 'settings.json');
      fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
      fs.writeFileSync(settingsPath, JSON.stringify({
        'editor.formatOnSave': true,
        'files.exclude': {
          '**/.next': true,
        },
      }, null, 2), 'utf-8');

      mergeVSCodeSettings(projectDir);
      mergeVSCodeSettings(projectDir);

      const settings = JSON.parse(readText(settingsPath)) as {
        'editor.formatOnSave': boolean;
        'files.exclude': Record<string, boolean>;
      };

      expect(settings['editor.formatOnSave']).toBe(true);
      expect(settings['files.exclude']['**/.next']).toBe(true);
      expect(settings['files.exclude']['.dev-loop/logs']).toBe(true);
    } finally {
      fs.rmSync(projectDir, { recursive: true, force: true });
    }
  });

  it('throws an actionable ConfigError when VS Code settings JSON is invalid', () => {
    const projectDir = makeTempProject();
    try {
      const settingsPath = path.join(projectDir, '.vscode', 'settings.json');
      fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
      fs.writeFileSync(settingsPath, '{ invalid json', 'utf-8');

      expect(() => mergeVSCodeSettings(projectDir)).toThrow(ConfigError);
      expect(() => mergeVSCodeSettings(projectDir)).toThrow(/Invalid VS Code settings JSON/);
    } finally {
      fs.rmSync(projectDir, { recursive: true, force: true });
    }
  });
});
