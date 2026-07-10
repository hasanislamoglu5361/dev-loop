// packages/cli/src/__tests__/feature094-cli-config.test.ts
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createCli } from '../cli.js';

const tempDirs: string[] = [];

async function makeProject(): Promise<string> {
  const projectDir = await fs.mkdtemp(path.join(os.tmpdir(), 'dev-loop-cli-'));
  tempDirs.push(projectDir);
  return projectDir;
}

describe('FEATURE094 - CLI Logs, Config, Patterns, Export Commands', () => {
  afterEach(async () => {
    await Promise.all(tempDirs.splice(0).map(dir => fs.rm(dir, { recursive: true, force: true })));
  });

  it('Test config set nested value via CLI command', async () => {
    const projectDir = await makeProject();
    // Create initial empty YAML
    await fs.writeFile(path.join(projectDir, 'dev-loop.yaml'), '', 'utf-8');

    const cli = createCli({ nodeVersion: 'v20.11.0' });

    await cli.parseAsync(['node', 'dev-loop', 'config', 'set', '--project-dir', projectDir, 'planning.primary.model', 'gpt-4'], { from: 'node' });

    const config = await fs.readFile(path.join(projectDir, 'dev-loop.yaml'), 'utf-8');
    expect(config).toContain('model: gpt-4');
  });

  it('Test query command rejects unsafe SQL through core', async () => {
    const projectDir = await makeProject();

    // Create a mock data API that validates SQL safety
    let capturedSql = '';
    const cli = createCli({
      nodeVersion: 'v20.11.0',
      dataApi: {
        query: async (sql, _opts) => {
          capturedSql = sql;
          if (/^DROP/i.test(sql)) {
            throw new Error('Unsafe SQL rejected by core: DROP TABLE is forbidden.');
          }
          return { rows: [{ id: 1 }] };
        },
      },
    });

    // Unsafe query should be rejected via data API
    await expect(
      cli.parseAsync(['node', 'dev-loop', 'query', '--project-dir', projectDir, 'DROP TABLE loop_history'], { from: 'node' }),
    ).rejects.toThrow(/unsafe|forbidden/i);

    // Safe query should pass through via data API
    await expect(
      cli.parseAsync(['node', 'dev-loop', 'query', '--project-dir', projectDir, 'SELECT id FROM loop_history'], { from: 'node' }),
    ).resolves.not.toThrow();

    expect(capturedSql).toBe('SELECT id FROM loop_history');
  });

  it('Test config show prints redacted JSON without leaking secrets', async () => {
    const projectDir = await makeProject();
    // Create a YAML with potential secret values in the model field
    await fs.writeFile(path.join(projectDir, 'dev-loop.yaml'), [
      '# dev-loop.yaml',
      'planning:',
      '  primary:',
      '    provider: anthropic',
      '    api_key: sk-test-secret-value',
      '',
      'test_runner:',
      '  command: npm test',
      '',
    ].join('\n'), 'utf-8');

    // Capture console.log output to verify redaction
    const originalLog = console.log;
    let capturedOutput = '';
    console.log = (msg: unknown) => { capturedOutput += String(msg) + '\n'; };

    try {
      const cli = createCli({ nodeVersion: 'v20.11.0' });
      await cli.parseAsync(['node', 'dev-loop', 'config', 'show', '--project-dir', projectDir], { from: 'node' });

      // api_key value should be redacted, not leaked
      expect(capturedOutput).toContain('[REDACTED]');
      expect(capturedOutput).not.toContain('sk-test-secret-value');
    } finally {
      console.log = originalLog;
    }
  });
});