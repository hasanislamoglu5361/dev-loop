import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { existsSync } from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const projects: string[] = [];

async function runBuiltCli(args: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
  const entrypoint = path.resolve('packages/cli/dist/main.js');
  expect(existsSync(entrypoint)).toBe(true);
  const child = spawn(process.execPath, [entrypoint, ...args], { env: process.env, stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', chunk => { stdout += String(chunk); });
  child.stderr.on('data', chunk => { stderr += String(chunk); });
  const [code] = await once(child, 'close') as [number];
  return { code, stdout, stderr };
}

async function writeIsolatedQualityConfig(projectDir: string, extra = ''): Promise<void> {
  await writeFile(path.join(projectDir, 'dev-loop.yaml'), `
version: "1"
quality_gate:
  enabled: true
  block_commit_on_failure: true
  checks:
    test_coverage_min: 0
    complexity_max: 0
    secrets: true
    vulnerabilities: false
    mcp_score_min: 0
    uncertain_tags: false
    lint: false
    type_coverage_min: 0
${extra}
`, 'utf8');
}

afterEach(async () => {
  await Promise.all(projects.splice(0).map(project => rm(project, { recursive: true, force: true })));
});

describe('FEATURE106 - quality gate CLI command', () => {
  it('runs the built quality command without crashing and blocks on a real detected secret', async () => {
    const projectDir = await mkdtemp(path.join(tmpdir(), 'dev-loop-quality-cli-'));
    projects.push(projectDir);
    await writeIsolatedQualityConfig(projectDir);
    await writeFile(
      path.join(projectDir, 'config.ts'),
      'export const apiKey = "sk-abcdefghijklmnopqrstuvwx1234567890";\n',
      'utf8',
    );

    const { code, stdout, stderr } = await runBuiltCli(['quality', '--project-dir', projectDir]);

    expect(stderr).not.toMatch(/undefined|is not a function|Cannot read prop/i);
    expect(code).toBe(1);
    const result = JSON.parse(stdout);
    expect(result.blockCommit).toBe(true);
    expect(result.failures).toContainEqual(expect.objectContaining({ kind: 'secrets' }));
    // The actual secret value must never appear in CLI output.
    expect(stdout).not.toContain('sk-abcdefghijklmnopqrstuvwx1234567890');
  });

  it('passes cleanly through the built entrypoint when no secrets are present and 0 thresholds mean "no minimum"', async () => {
    const projectDir = await mkdtemp(path.join(tmpdir(), 'dev-loop-quality-cli-clean-'));
    projects.push(projectDir);
    await writeIsolatedQualityConfig(projectDir);
    await writeFile(path.join(projectDir, 'config.ts'), 'export const greeting = "hello";\n', 'utf8');
    await writeFile(
      path.join(projectDir, 'package.json'),
      JSON.stringify({ name: 'quality-cli-fixture', version: '0.0.0', scripts: { typecheck: 'node -e "process.exit(0)"' } }),
      'utf8',
    );

    const { code, stdout, stderr } = await runBuiltCli(['quality', '--project-dir', projectDir]);

    expect(stderr).not.toMatch(/undefined|is not a function|Cannot read prop/i);
    expect(code, stdout).toBe(0);
    const result = JSON.parse(stdout);
    expect(result.blockCommit).toBe(false);
    expect(result.failures).toEqual([]);
  });
});
