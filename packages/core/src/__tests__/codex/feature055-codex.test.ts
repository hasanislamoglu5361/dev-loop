import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import { CodexCliVerifier } from '../../models/verifier/codex-cli.js';
import type { ProcessResult } from '../../utils/process.js';

describe('FEATURE055 - Codex CLI Verifier', () => {
  it('runs Codex CLI review and parses non-perfect JSON output safely', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'dev-loop-codex-verifier-'));
    const prompts: string[] = [];
    const verifier = new CodexCliVerifier({
      promptFile: path.join(dir, 'prompt.md'),
      runner: async options => {
        prompts.push(await fs.readFile(options.promptFile, 'utf8'));
        return {
          command: 'codex',
          args: [],
          exitCode: 0,
          stdout: 'Here is the review:\n```json\n{"bugs":[],"confidence":0.88,"mcp_score":92}\n```',
          stderr: '',
        } satisfies ProcessResult;
      },
    });

    await expect(verifier.review({
      featureId: 'FEATURE055',
      prompt: 'review codex verifier',
      changedFiles: ['src/a.ts'],
    })).resolves.toMatchObject({
      status: 'pass',
      confidenceScore: 0.88,
    });
    expect(prompts[0]).toContain('FEATURE055');
  });
});
