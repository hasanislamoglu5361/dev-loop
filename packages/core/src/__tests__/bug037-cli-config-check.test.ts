// packages/core/src/__tests__/bug037-cli-config-check.test.ts
// Regression test for BUG037: `safeParseWithMessage` existed but nothing in the
// CLI ever called it, so "CLI can print helpful validation failures" was unmet.
// This drives the real CLI command (not just the library function) end to end.

import { afterEach, describe, expect, it, vi } from 'vitest';
import * as fsSync from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

async function importCli() {
  const mod = await import('../../../cli/src/cli.js') as { createCli: () => import('commander').Command };
  return mod.createCli();
}

function tempProjectDir(): string {
  return fsSync.mkdtempSync(path.join(os.tmpdir(), 'dev-loop-bug037-'));
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('BUG037 - CLI prints helpful config validation failures', () => {
  it('prints an actionable message and sets a failing exit code for invalid config', async () => {
    const projectDir = tempProjectDir();
    fsSync.writeFileSync(path.join(projectDir, 'dev-loop.yaml'), 'ui:\n  port: "not-a-number"\n');

    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const originalExitCode = process.exitCode;

    try {
      const cli = await importCli();
      await cli.parseAsync(['node', 'dev-loop', 'config-check', '--project-dir', projectDir]);

      expect(process.exitCode).toBe(1);
      expect(errorSpy).toHaveBeenCalled();
      const printed = errorSpy.mock.calls.map(call => String(call[0])).join('\n');
      expect(printed).toContain('ui');
      expect(printed).toContain('port');
    } finally {
      process.exitCode = originalExitCode;
    }
  });

  it('reports success for a valid config file', async () => {
    const projectDir = tempProjectDir();
    fsSync.writeFileSync(path.join(projectDir, 'dev-loop.yaml'), 'version: "1"\n');

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const originalExitCode = process.exitCode;

    try {
      const cli = await importCli();
      await cli.parseAsync(['node', 'dev-loop', 'config-check', '--project-dir', projectDir]);

      expect(process.exitCode).not.toBe(1);
      expect(logSpy).toHaveBeenCalled();
    } finally {
      process.exitCode = originalExitCode;
    }
  });
});
