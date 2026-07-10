import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import { ClaudeCliVerifier } from '../../models/verifier/claude-cli.js';
import { ClaudeCodeCliVerifier, buildClaudeReviewPrompt } from '../../models/verifier/claude-code-cli.js';
import type { ProcessResult } from '../../utils/process.js';

describe('FEATURE054 - Claude Code and Claude CLI Verifiers', () => {
  it('builds a review prompt with diff, tests, uncertain tags, and MCP usage', () => {
    const prompt = buildClaudeReviewPrompt({
      featureId: 'FEATURE054',
      prompt: 'review the change',
      changedFiles: ['src/a.ts'],
      diff: 'diff --git a/src/a.ts b/src/a.ts',
      testOutput: 'npm test passed',
      uncertainTags: ['race-condition'],
      mcpUsage: [{ server: 'filesystem', tool: 'read_file', count: 2 }],
    });

    expect(prompt).toContain('FEATURE054');
    expect(prompt).toContain('diff --git');
    expect(prompt).toContain('npm test passed');
    expect(prompt).toContain('race-condition');
    expect(prompt).toContain('filesystem');
    expect(prompt).not.toContain('close Jira');
  });

  it('runs Claude Code CLI, parses output, and writes BUGS.md atomically', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'dev-loop-claude-verifier-'));
    const promptFile = path.join(dir, 'prompt.md');
    const bugsFile = path.join(dir, 'BUGS.md');
    const calls: string[] = [];
    const runner = async (options: { promptFile: string }): Promise<ProcessResult> => {
      calls.push(await fs.readFile(options.promptFile, 'utf8'));
      return {
        command: 'claude-code',
        args: [],
        exitCode: 0,
        stdout: '```json\n{"bugs":[{"severity":"medium","message":"Needs a guard"}],"confidence":0.8,"mcp_score":90}\n```',
        stderr: '',
      };
    };
    const verifier = new ClaudeCodeCliVerifier({ runner, promptFile, bugsFile });

    const result = await verifier.review({
      featureId: 'FEATURE054',
      prompt: 'review',
      changedFiles: ['src/a.ts'],
      diff: 'diff text',
      testOutput: 'test output',
      uncertainTags: ['maybe'],
      mcpUsage: [],
    });

    expect(result).toMatchObject({
      status: 'needs-changes',
      findings: [{ severity: 'warning', message: 'Needs a guard' }],
      confidenceScore: 0.8,
    });
    expect(calls[0]).toContain('diff text');
    await expect(fs.readFile(bugsFile, 'utf8')).resolves.toContain('Needs a guard');
  });

  it('runs Claude CLI with the same verifier contract', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'dev-loop-claude-cli-'));
    const verifier = new ClaudeCliVerifier({
      promptFile: path.join(dir, 'prompt.md'),
      runner: async () => ({
        command: 'claude',
        args: [],
        exitCode: 0,
        stdout: '```json\n{"bugs":[],"confidence":0.95,"mcp_score":{"score":100}}\n```',
        stderr: '',
      }),
    });

    await expect(verifier.review({
      featureId: 'FEATURE054',
      prompt: 'review',
      changedFiles: [],
    })).resolves.toMatchObject({
      status: 'pass',
      confidenceScore: 0.95,
    });
  });
});
