import fs from 'node:fs/promises';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { scanSecrets } from '../utils/secret-scanner.js';
import { cleanupTempProject, createTempProject } from './helpers/temp-dir.js';

const tempProjects: string[] = [];

async function tempProject(): Promise<string> {
  const projectDir = createTempProject('dev-loop-secret-scan-');
  tempProjects.push(projectDir);
  await fs.mkdir(path.join(projectDir, 'src'), { recursive: true });
  return projectDir;
}

describe('FEATURE068 - secret scanner', () => {
  afterEach(() => {
    while (tempProjects.length > 0) {
      cleanupTempProject(tempProjects.pop() as string);
    }
  });

  it('Test secret detection', async () => {
    const projectDir = await tempProject();
    await fs.writeFile(path.join(projectDir, 'src', 'config.ts'), [
      'export const apiKey = "sk-test-12345678901234567890";',
      'export const token = "ghp_123456789012345678901234567890123456";',
      'export const password = "correct-horse-battery-staple";',
      'export const webhook = "https://hooks.slack.com/services/T000/B000/XXXXXXXXXXXXXXXXXXXXXXXX";',
    ].join('\n'));

    const result = await scanSecrets({ projectDir });

    expect(result.blocked).toBe(true);
    expect(result.findings.map(finding => finding.kind).sort()).toEqual([
      'api_key',
      'password',
      'token',
      'webhook_url',
    ]);
    expect(result.findings.every(finding => finding.filePath === 'src/config.ts')).toBe(true);
  });

  it('Test placeholder not flagged', async () => {
    const projectDir = await tempProject();
    await fs.writeFile(path.join(projectDir, 'src', 'env.ts'), [
      'export const openai = "${OPENAI_API_KEY}";',
      'export const password = "${DATABASE_PASSWORD}";',
      'export const token = "${GITHUB_TOKEN}";',
    ].join('\n'));

    const result = await scanSecrets({ projectDir });

    expect(result).toEqual({ blocked: false, findings: [] });
  });

  it('Test redaction', async () => {
    const projectDir = await tempProject();
    const rawSecret = 'sk-test-abcdefghijklmnopqrstuvwx';
    await fs.writeFile(path.join(projectDir, 'src', 'secret.ts'), `const apiKey = "${rawSecret}";\n`);

    const result = await scanSecrets({ projectDir, changedFiles: ['src/secret.ts'] });

    expect(result.findings).toHaveLength(1);
    expect(JSON.stringify(result)).not.toContain(rawSecret);
    expect(result.findings[0]).toMatchObject({
      filePath: 'src/secret.ts',
      redactedValue: '[REDACTED]',
      line: 1,
      kind: 'api_key',
    });
  });

  it('scans changed files and ignores generated dependency folders', async () => {
    const projectDir = await tempProject();
    await fs.mkdir(path.join(projectDir, 'node_modules', 'pkg'), { recursive: true });
    await fs.writeFile(path.join(projectDir, 'src', 'safe.ts'), 'export const value = "ok";\n');
    await fs.writeFile(
      path.join(projectDir, 'node_modules', 'pkg', 'bad.js'),
      'module.exports = { token: "ghp_123456789012345678901234567890123456" };\n',
    );

    const result = await scanSecrets({
      projectDir,
      changedFiles: ['src/safe.ts', 'node_modules/pkg/bad.js'],
    });

    expect(result).toEqual({ blocked: false, findings: [] });
  });
});
