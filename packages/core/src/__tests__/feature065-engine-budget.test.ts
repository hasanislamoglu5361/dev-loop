import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { closeDatabase } from '../db/connection.js';
import { getLoopDetail } from '../db/queries/index.js';
import { runLoop } from '../runtime/engine.js';
import type { ReviewResult } from '../models/index.js';
import { cleanupTempProject, createTempProject } from './helpers/temp-dir.js';
import fs from 'node:fs/promises';

const tempProjects: string[] = [];

function tempProject(): string {
  const projectDir = createTempProject('dev-loop-engine-budget-');
  tempProjects.push(projectDir);
  return projectDir;
}

function bugReview(): ReviewResult {
  return {
    status: 'needs-changes',
    summary: 'retry needed',
    findings: [{ severity: 'error', message: 'Try again', file: 'src/a.ts' }],
    confidenceScore: 0.8,
    sandboxApproval: { approved: true, reason: 'fake' },
    mcpScore: { score: 80, maxScore: 100, normalized: 0.8 },
  };
}

async function writeConfig(projectDir: string, loopConfig: string): Promise<void> {
  await fs.writeFile(
    path.join(projectDir, 'dev-loop.yaml'),
    [
      'version: "1"',
      'loop:',
      '  max_retry: 3',
      loopConfig,
    ].join('\n'),
  );
}

describe('FEATURE065 - loop budget and time limits', () => {
  afterEach(() => {
    closeDatabase();
    while (tempProjects.length > 0) {
      cleanupTempProject(tempProjects.pop() as string);
    }
  });

  it('Test cost limit', async () => {
    const projectDir = tempProject();
    await writeConfig(projectDir, [
      '  cost_budget_usd: 0.000001',
      '  time_budget_minutes: 60',
    ].join('\n'));
    const notify = vi.fn(async () => undefined);
    const generate = vi.fn(async () => ({
      text: [
        '```ts',
        '// FILE: src/a.ts',
        'export const a = true;',
        '```',
      ].join('\n'),
      inputTokens: 1000,
      outputTokens: 1000,
    }));

    const result = await runLoop('FEATURE065-cost', {
      projectDir,
      dbPath: path.join(projectDir, '.dev-loop', 'dev-loop.db'),
      dependencies: {
        selectModel: () => ({ provider: 'openrouter', model: 'openai/gpt-4o' }),
        selectVerifier: () => ({ provider: 'fake-verifier', model: 'reviewer' }),
        buildContext: async () => 'context',
        generate,
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
            changedFiles: ['src/a.ts'],
          })),
        },
        verifier: { review: vi.fn(async () => bugReview()) },
        notify,
      },
    });

    expect(result).toMatchObject({
      success: false,
      exitReason: 'cost_budget',
    });
    expect(result.turns).toHaveLength(1);
    expect(generate).toHaveBeenCalledTimes(1);
    expect(notify).toHaveBeenCalledWith(expect.objectContaining({
      event: 'budget_exceeded',
      reason: 'cost_budget',
      featureId: 'FEATURE065-cost',
    }));
    const loop = await getLoopDetail(result.loopId);
    expect(loop).toMatchObject({
      success: 0,
      failure_reason: expect.stringContaining('Cost budget exceeded'),
    });
  });

  it('Test time limit', async () => {
    const projectDir = tempProject();
    await writeConfig(projectDir, [
      '  cost_budget_usd: 5',
      '  time_budget_minutes: 0.001',
    ].join('\n'));
    const now = vi
      .fn()
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(0)
      .mockReturnValue(70);
    const generate = vi.fn(async () => ({
      text: [
        '```ts',
        '// FILE: src/time.ts',
        'export const time = true;',
        '```',
      ].join('\n'),
      inputTokens: 0,
      outputTokens: 0,
    }));

    const result = await runLoop('FEATURE065-time', {
      projectDir,
      dbPath: path.join(projectDir, '.dev-loop', 'dev-loop.db'),
      dependencies: {
        selectModel: () => ({ provider: 'local', model: 'fake' }),
        selectVerifier: () => ({ provider: 'fake-verifier', model: 'reviewer' }),
        buildContext: async () => 'context',
        generate,
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
            changedFiles: ['src/time.ts'],
          })),
        },
        verifier: { review: vi.fn(async () => bugReview()) },
        now,
      },
    });

    expect(result).toMatchObject({
      success: false,
      exitReason: 'time_budget',
    });
    expect(generate).toHaveBeenCalledTimes(1);
    const loop = await getLoopDetail(result.loopId);
    expect(loop?.failure_reason).toContain('Time budget exceeded');
  });

  it('Test notification failure does not crash loop', async () => {
    const projectDir = tempProject();
    await writeConfig(projectDir, [
      '  cost_budget_usd: 0.000001',
      '  time_budget_minutes: 60',
    ].join('\n'));

    const result = await runLoop('FEATURE065-notify', {
      projectDir,
      dbPath: path.join(projectDir, '.dev-loop', 'dev-loop.db'),
      dependencies: {
        selectModel: () => ({ provider: 'openrouter', model: 'openai/gpt-4o' }),
        selectVerifier: () => ({ provider: 'fake-verifier', model: 'reviewer' }),
        buildContext: async () => 'context',
        generate: async () => ({
          text: [
            '```ts',
            '// FILE: src/notify.ts',
            'export const notify = true;',
            '```',
          ].join('\n'),
          inputTokens: 1000,
          outputTokens: 1000,
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
            changedFiles: ['src/notify.ts'],
          })),
        },
        verifier: { review: vi.fn(async () => bugReview()) },
        notify: vi.fn(async () => {
          throw new Error('notification backend down');
        }),
      },
    });

    expect(result.success).toBe(false);
    expect(result.exitReason).toBe('cost_budget');
    expect(result.notificationErrors).toEqual(['notification backend down']);
  });
});
