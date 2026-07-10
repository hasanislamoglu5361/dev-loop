import fs from 'node:fs/promises';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { closeDatabase } from '../db/connection.js';
import { getLoopDetail, getLoopTurns } from '../db/queries/index.js';
import type { ReviewResult } from '../models/index.js';
import { runLoop } from '../runtime/engine.js';
import { cleanupTempProject, createTempProject } from './helpers/temp-dir.js';

const tempProjects: string[] = [];

function tempProject(): string {
  const projectDir = createTempProject('dev-loop-engine-fallback-');
  tempProjects.push(projectDir);
  return projectDir;
}

function review(findings: ReviewResult['findings']): ReviewResult {
  return {
    status: findings.length > 0 ? 'needs-changes' : 'pass',
    summary: findings.length > 0 ? 'bugs remain' : 'clean',
    findings,
    confidenceScore: 0.9,
    sandboxApproval: { approved: true, reason: 'fake' },
    mcpScore: { score: 90, maxScore: 100, normalized: 0.9 },
  };
}

async function writeOneRetryConfig(projectDir: string): Promise<void> {
  await fs.writeFile(
    path.join(projectDir, 'dev-loop.yaml'),
    [
      'version: "1"',
      'loop:',
      '  max_retry: 1',
      '  cost_budget_usd: 5',
      '  time_budget_minutes: 60',
      'fallback:',
      '  provider: codex-cli',
      '  effort: high',
      '  max_attempts: 1',
    ].join('\n'),
  );
}

async function writeExplicitModelConfig(projectDir: string): Promise<void> {
  await fs.writeFile(
    path.join(projectDir, 'dev-loop.yaml'),
    [
      'version: "1"',
      'loop:',
      '  max_retry: 1',
      '  cost_budget_usd: 5',
      '  time_budget_minutes: 60',
      'fallback:',
      '  provider: api',
      '  model: gpt-4-turbo',
      '  effort: high',
      '  max_attempts: 1',
    ].join('\n'),
  );
}

describe('FEATURE066 - loop fallback model path', () => {
  afterEach(() => {
    closeDatabase();
    while (tempProjects.length > 0) {
      cleanupTempProject(tempProjects.pop() as string);
    }
  });

  it('Test primary fails then fallback succeeds', async () => {
    const projectDir = tempProject();
    await writeOneRetryConfig(projectDir);
    const buildFallbackContext = vi.fn(async () => 'fallback full context');

    const result = await runLoop('FEATURE066-success', {
      projectDir,
      dbPath: path.join(projectDir, '.dev-loop', 'dev-loop.db'),
      dependencies: {
        selectModel: () => ({ provider: 'local', model: 'primary' }),
        selectVerifier: () => ({ provider: 'fake-verifier', model: 'reviewer' }),
        buildContext: async () => 'primary context',
        generate: async () => ({
          text: '```ts\n// FILE: src/primary.ts\nexport const primary = true;\n```',
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
            changedFiles: ['src/primary.ts'],
          })),
        },
        verifier: { review: vi.fn(async () => review([{ severity: 'error', message: 'Primary bug', file: 'src/primary.ts' }])) },
        buildFallbackContext,
        fallbackGenerate: async () => ({
          text: '```ts\n// FILE: src/fallback.ts\nexport const fallback = true;\n```',
          inputTokens: 10,
          outputTokens: 5,
        }),
        fallbackVerifier: { review: vi.fn(async () => review([])) },
        collectSource: async () => 'source snapshot',
        collectPatterns: async () => ['known pattern'],
        collectMcpUsage: async () => [{ server: 'filesystem' }],
      },
    });

    expect(result).toMatchObject({
      success: true,
      exitReason: 'fallback_verified',
      fallbackUsed: true,
    });
    expect(buildFallbackContext).toHaveBeenCalledWith(expect.objectContaining({
      featureId: 'FEATURE066-success',
      bugs: [expect.objectContaining({ message: 'Primary bug' })],
      source: 'source snapshot',
      patterns: ['known pattern'],
      mcpUsage: [{ server: 'filesystem' }],
    }));

    const turns = await getLoopTurns(result.loopId);
    expect(turns.map(turn => turn.agent)).toEqual(['primary', 'fallback']);
    const loop = await getLoopDetail(result.loopId);
    expect(loop).toMatchObject({
      success: 1,
      fallback_used: 1,
      fallback_model: 'codex-cli',
    });
  });

  it('Test configured fallback.model is used, not fallback.provider', async () => {
    const projectDir = tempProject();
    await writeExplicitModelConfig(projectDir);
    const buildFallbackContext = vi.fn(async () => 'fallback full context');
    const fallbackGenerate = vi.fn(async () => ({
      text: '```ts\n// FILE: src/fallback.ts\nexport const fallback = true;\n```',
      inputTokens: 10,
      outputTokens: 5,
    }));

    const result = await runLoop('FEATURE066-explicit-model', {
      projectDir,
      dbPath: path.join(projectDir, '.dev-loop', 'dev-loop.db'),
      dependencies: {
        selectModel: () => ({ provider: 'local', model: 'primary' }),
        selectVerifier: () => ({ provider: 'fake-verifier', model: 'reviewer' }),
        buildContext: async () => 'primary context',
        generate: async () => ({
          text: '```ts\n// FILE: src/primary.ts\nexport const primary = true;\n```',
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
            changedFiles: ['src/primary.ts'],
          })),
        },
        verifier: { review: vi.fn(async () => review([{ severity: 'error', message: 'Primary bug', file: 'src/primary.ts' }])) },
        buildFallbackContext,
        fallbackGenerate,
        fallbackVerifier: { review: vi.fn(async () => review([])) },
        collectSource: async () => 'source snapshot',
        collectPatterns: async () => ['known pattern'],
        collectMcpUsage: async () => [{ server: 'filesystem' }],
      },
    });

    expect(result).toMatchObject({
      success: true,
      exitReason: 'fallback_verified',
      fallbackUsed: true,
    });
    expect(fallbackGenerate).toHaveBeenCalledWith(expect.objectContaining({
      model: { provider: 'api', model: 'gpt-4-turbo' },
    }));

    const turns = await getLoopTurns(result.loopId);
    const fallbackTurn = turns.find(turn => turn.agent === 'fallback');
    expect(fallbackTurn).toMatchObject({ model: 'gpt-4-turbo' });

    const loop = await getLoopDetail(result.loopId);
    expect(loop).toMatchObject({
      success: 1,
      fallback_used: 1,
      fallback_model: 'gpt-4-turbo',
    });
  });

  it('Test primary and fallback both fail', async () => {
    const projectDir = tempProject();
    await writeOneRetryConfig(projectDir);
    const notify = vi.fn(async () => undefined);

    const result = await runLoop('FEATURE066-failure', {
      projectDir,
      dbPath: path.join(projectDir, '.dev-loop', 'dev-loop.db'),
      dependencies: {
        selectModel: () => ({ provider: 'local', model: 'primary' }),
        selectVerifier: () => ({ provider: 'fake-verifier', model: 'reviewer' }),
        buildContext: async () => 'primary context',
        generate: async () => ({
          text: '```ts\n// FILE: src/primary.ts\nexport const primary = true;\n```',
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
            changedFiles: ['src/primary.ts'],
          })),
        },
        verifier: { review: vi.fn(async () => review([{ severity: 'error', message: 'Primary bug' }])) },
        buildFallbackContext: async () => 'fallback context',
        fallbackGenerate: async () => ({
          text: '```ts\n// FILE: src/fallback.ts\nexport const fallback = false;\n```',
          inputTokens: 0,
          outputTokens: 0,
        }),
        fallbackVerifier: { review: vi.fn(async () => review([{ severity: 'error', message: 'Fallback bug' }])) },
        notify,
      },
    });

    expect(result).toMatchObject({
      success: false,
      exitReason: 'fallback_failed',
      fallbackUsed: true,
    });
    expect(notify).toHaveBeenCalledWith(expect.objectContaining({
      event: 'fallback_failed',
      featureId: 'FEATURE066-failure',
    }));
    const loop = await getLoopDetail(result.loopId);
    expect(loop).toMatchObject({
      success: 0,
      fallback_used: 1,
      failure_reason: expect.stringContaining('Fallback failed'),
    });
  });
});
