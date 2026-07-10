import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { closeDatabase } from '../db/connection.js';
import { getLoopDetail, getLoopTurns, getMcpScores } from '../db/queries/index.js';
import { runLoop } from '../runtime/engine.js';
import type { ReviewResult } from '../models/index.js';
import { cleanupTempProject, createTempProject } from './helpers/temp-dir.js';

const tempProjects: string[] = [];

function tempProject(): string {
  const projectDir = createTempProject('dev-loop-engine-retry-');
  tempProjects.push(projectDir);
  return projectDir;
}

function reviewResult(params: Partial<ReviewResult>): ReviewResult {
  return {
    status: params.findings && params.findings.length > 0 ? 'needs-changes' : 'pass',
    summary: params.summary ?? 'reviewed',
    findings: params.findings ?? [],
    confidenceScore: params.confidenceScore ?? 0.9,
    sandboxApproval: { approved: true, reason: 'fake verifier' },
    mcpScore: params.mcpScore ?? { score: 90, maxScore: 100, normalized: 0.9 },
  };
}

describe('FEATURE064 - loop verifier review and retry', () => {
  afterEach(() => {
    closeDatabase();
    while (tempProjects.length > 0) {
      cleanupTempProject(tempProjects.pop() as string);
    }
  });

  it('Test verifier bug causes second turn', async () => {
    const projectDir = tempProject();
    const buildContext = vi
      .fn()
      .mockResolvedValueOnce('first context')
      .mockResolvedValueOnce('retry context');
    const generate = vi
      .fn()
      .mockResolvedValueOnce({
        text: [
          '```ts',
          '// FILE: src/retry.ts',
          'export const retry = 1;',
          '```',
        ].join('\n'),
        inputTokens: 100,
        outputTokens: 50,
      })
      .mockResolvedValueOnce({
        text: [
          '```ts',
          '// FILE: src/retry.ts',
          'export const retry = 2;',
          '```',
        ].join('\n'),
        inputTokens: 100,
        outputTokens: 50,
      });
    const testRunner = {
      run: vi.fn(async () => ({
        runner: 'none' as const,
        success: true,
        status: 'passed' as const,
        args: [],
        exitCode: 0,
        stdout: 'tests passed\n',
        stderr: '',
        summary: 'tests passed',
        changedFiles: ['src/retry.ts'],
      })),
    };
    const verifier = {
      review: vi
        .fn()
        .mockResolvedValueOnce(reviewResult({
          summary: 'Needs retry',
          confidenceScore: 0.42,
          findings: [{ severity: 'error', message: 'Fix retry file', file: 'src/retry.ts', line: 1 }],
          mcpScore: { score: 55, maxScore: 100, normalized: 0.55 },
        }))
        .mockResolvedValueOnce(reviewResult({
          summary: 'Clean now',
          confidenceScore: 0.95,
          findings: [],
          mcpScore: { score: 100, maxScore: 100, normalized: 1 },
        })),
    };

    const result = await runLoop('FEATURE064', {
      projectDir,
      dbPath: path.join(projectDir, '.dev-loop', 'dev-loop.db'),
      dependencies: {
        selectModel: () => ({ provider: 'local', model: 'fake-coder' }),
        selectVerifier: () => ({ provider: 'fake-verifier', model: 'reviewer' }),
        buildContext,
        generate,
        testRunner,
        verifier,
        collectDiff: async () => 'diff --git a/src/retry.ts b/src/retry.ts',
        collectUncertainTags: async () => ['TODO:UNCERTAIN'],
        collectMcpUsage: async () => [{ server: 'filesystem', tool: 'read_file' }],
      },
    });

    expect(result.success).toBe(true);
    expect(result.turns).toHaveLength(2);
    expect(buildContext).toHaveBeenNthCalledWith(2, expect.objectContaining({
      turn: 2,
      bugs: [expect.objectContaining({ message: 'Fix retry file', file: 'src/retry.ts' })],
      focusFiles: ['src/retry.ts'],
    }));
    expect(verifier.review).toHaveBeenNthCalledWith(1, expect.objectContaining({
      changedFiles: ['src/retry.ts'],
      metadata: expect.objectContaining({
        diff: 'diff --git a/src/retry.ts b/src/retry.ts',
        testFailures: [],
        uncertainTags: ['TODO:UNCERTAIN'],
        mcpUsage: [{ server: 'filesystem', tool: 'read_file' }],
      }),
    }));
    expect(verifier.review).toHaveBeenCalledTimes(2);

    const turns = await getLoopTurns(result.loopId);
    expect(turns).toHaveLength(2);
    const mcpScores = await getMcpScores({ loopId: result.loopId });
    expect(mcpScores.map(score => score.score)).toEqual([100, 55]);

    const bugs = fs.readFileSync(path.join(projectDir, '.dev-loop', 'BUGS.md'), 'utf8');
    expect(bugs).toContain('Fix retry file');
    expect(bugs).toContain('confidence: 0.42');
  });

  it('Test no bugs plus passing tests exits success path placeholder', async () => {
    const projectDir = tempProject();
    const verifier = {
      review: vi.fn(async () => reviewResult({
        summary: 'No bugs',
        confidenceScore: 0.99,
        findings: [],
        mcpScore: { score: 95, maxScore: 100, normalized: 0.95 },
      })),
    };

    const result = await runLoop('FEATURE064-success', {
      projectDir,
      dbPath: path.join(projectDir, '.dev-loop', 'dev-loop.db'),
      dependencies: {
        selectModel: () => ({ provider: 'local', model: 'fake-coder' }),
        selectVerifier: () => ({ provider: 'fake-verifier', model: 'reviewer' }),
        buildContext: async () => 'context',
        generate: async () => ({
          text: [
            '```ts',
            '// FILE: src/ok.ts',
            'export const ok = true;',
            '```',
          ].join('\n'),
          inputTokens: 0,
          outputTokens: 0,
        }),
        testRunner: {
          run: vi.fn(async () => ({
            runner: 'none' as const,
            success: true,
            status: 'passed' as const,
            args: [],
            exitCode: 0,
            stdout: 'passed\n',
            stderr: '',
            summary: 'passed',
            changedFiles: ['src/ok.ts'],
          })),
        },
        verifier,
      },
    });

    expect(result).toMatchObject({
      success: true,
      exitReason: 'verified',
      turns: [expect.objectContaining({ turnNumber: 1, success: true })],
    });
    expect(verifier.review).toHaveBeenCalledTimes(1);
    const loop = await getLoopDetail(result.loopId);
    expect(loop?.success).toBe(1);
  });
});
