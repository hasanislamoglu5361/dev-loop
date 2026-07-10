import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const projects: string[] = [];

async function runBuiltCli(args: string[], env: NodeJS.ProcessEnv = process.env): Promise<{ code: number; stdout: string; stderr: string }> {
  const entrypoint = path.resolve('packages/cli/dist/main.js');
  expect(existsSync(entrypoint)).toBe(true);
  const child = spawn(process.execPath, [entrypoint, ...args], { env, stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', chunk => { stdout += String(chunk); });
  child.stderr.on('data', chunk => { stderr += String(chunk); });
  const [code] = await once(child, 'close') as [number];
  return { code, stdout, stderr };
}

afterEach(async () => {
  await Promise.all(projects.splice(0).map(project => rm(project, { recursive: true, force: true })));
});

describe('FEATURE101 - shipped CLI runtime', () => {
  it('runs generation, file application, tests, verifier and persistence through the built entrypoint', async () => {
    const projectDir = await mkdtemp(path.join(tmpdir(), 'dev-loop-built-cli-'));
    projects.push(projectDir);
    await writeFile(path.join(projectDir, 'dev-loop.yaml'), `
version: "1"
coding:
  primary: { provider: lmstudio, model: deterministic, temperature: 0, max_tokens: 256 }
  auto_select: { enabled: false }
verifier: { provider: api, model: deterministic }
test_runner: { type: none }
loop: { sandbox_mode: false, max_retry: 1 }
git: { auto_commit: false }
quality_gate: { enabled: false }
notifications:
  desktop: { enabled: false, events: [] }
`, 'utf8');

    let calls = 0;
    const server = createServer((request, response) => {
      if (request.url === '/v1/chat/completions') {
        calls += 1;
        const content = calls === 1
          ? '```ts\n// FILE: generated.ts\nexport const generated = true;\n```'
          : '```json\n{"bugs":[],"confidence":1,"mcp_score":100,"uncertain_fields":[],"summary":"verified"}\n```';
        response.writeHead(200, { 'content-type': 'application/json' });
        response.end(JSON.stringify({ model: 'deterministic', choices: [{ message: { content }, finish_reason: 'stop' }], usage: { prompt_tokens: 2, completion_tokens: 3 } }));
        return;
      }
      response.writeHead(404).end();
    });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Fake provider did not bind a TCP port.');

    const { code, stdout, stderr } = await runBuiltCli(
      ['run', 'FEATURE101', '--project-dir', projectDir],
      { ...process.env, DEV_LOOP_LMSTUDIO_URL: `http://127.0.0.1:${address.port}` },
    );
    server.close();

    expect(code, stderr).toBe(0);
    expect(calls).toBe(2);
    await expect(readFile(path.join(projectDir, 'generated.ts'), 'utf8')).resolves.toContain('generated = true');
    expect(stdout).toContain('"exitReason": "verified"');
    expect(existsSync(path.join(projectDir, '.dev-loop', 'dev-loop.db'))).toBe(true);
  });

  it('initializes and repeats non-interactive setup through the built entrypoint without leaking secrets', async () => {
    const projectDir = await mkdtemp(path.join(tmpdir(), 'dev-loop-built-init-'));
    projects.push(projectDir);
    const initialized = await runBuiltCli(['init', '--project-dir', projectDir]);
    expect(initialized.code, initialized.stderr).toBe(0);
    const configured = await runBuiltCli(['setup', '--non-interactive', '--project-dir', projectDir]);
    expect(configured.code, configured.stderr).toBe(0);

    const yaml = await readFile(path.join(projectDir, 'dev-loop.yaml'), 'utf8');
    expect(yaml).toContain('${ANTHROPIC_API_KEY}');
    expect(yaml).not.toMatch(/sk-[A-Za-z0-9_-]{20,}/);
    expect(existsSync(path.join(projectDir, '.dev-loop', 'dev-loop.db'))).toBe(true);
    await expect(readFile(path.join(projectDir, '.dev-loop', 'CODE_MAP.md'), 'utf8')).resolves.toContain('# Code Map');
  });
});
