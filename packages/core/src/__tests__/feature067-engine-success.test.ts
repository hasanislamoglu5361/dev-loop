import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { closeDatabase } from '../db/connection.js';
import { getLoopDetail } from '../db/queries/index.js';
import type { ReviewResult } from '../models/index.js';
import { runLoop, SuccessHookError } from '../runtime/engine.js';
import { cleanupTempProject, createTempProject } from './helpers/temp-dir.js';

const tempProjects: string[] = [];

function tempProject(): string {
  const projectDir = createTempProject('dev-loop-engine-success-');
  tempProjects.push(projectDir);
  return projectDir;
}

function cleanReview(): ReviewResult {
  return {
    status: 'pass',
    summary: 'clean',
    findings: [],
    confidenceScore: 0.95,
    sandboxApproval: { approved: true, reason: 'fake' },
    mcpScore: { score: 100, maxScore: 100, normalized: 1 },
  };
}

function baseDependencies(overrides: Record<string, unknown> = {}) {
  return {
    selectModel: () => ({ provider: 'local', model: 'fake-coder' }),
    selectVerifier: () => ({ provider: 'fake-verifier', model: 'reviewer' }),
    buildContext: async () => 'context',
    generate: async () => ({
      text: '```ts\n// FILE: src/success.ts\nexport const success = true;\n```',
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
        changedFiles: ['src/success.ts'],
      })),
    },
    verifier: { review: vi.fn(async () => cleanReview()) },
    ...overrides,
  };
}

describe('FEATURE067 - loop success hooks', () => {
  afterEach(() => {
    closeDatabase();
    while (tempProjects.length > 0) {
      cleanupTempProject(tempProjects.pop() as string);
    }
  });

  it('Test hooks run in correct order', async () => {
    const projectDir = tempProject();
    const calls: string[] = [];
    const hooks = Object.fromEntries(
      [
        'updateCodeMap',
        'updateDecisions',
        'updateDocs',
        'recordLearning',
        'updateCalibration',
        'commit',
      ].map(name => [name, vi.fn(async () => calls.push(name))]),
    );
    const notify = vi.fn(async () => calls.push('notify'));

    const result = await runLoop('FEATURE067-order', {
      projectDir,
      dbPath: path.join(projectDir, '.dev-loop', 'dev-loop.db'),
      dependencies: baseDependencies({ successHooks: hooks, notify }),
    });

    expect(result).toMatchObject({
      success: true,
      exitReason: 'verified',
      successHooks: ['updateCodeMap', 'updateDecisions', 'updateDocs', 'recordLearning', 'updateCalibration', 'commit', 'notify'],
    });
    expect(calls).toEqual(['updateCodeMap', 'updateDecisions', 'updateDocs', 'recordLearning', 'updateCalibration', 'commit', 'notify']);
    expect(notify).toHaveBeenCalledWith(expect.objectContaining({
      event: 'success',
      featureId: 'FEATURE067-order',
    }));
  });

  it('Test optional integrations skipped when disabled', async () => {
    const projectDir = tempProject();
    const optionalHooks = {
      createPullRequest: vi.fn(),
      updateTicket: vi.fn(),
      runSmokeTests: vi.fn(),
      exportFineTuneDataset: vi.fn(),
      syncObsidian: vi.fn(),
      updateCalendar: vi.fn(),
    };

    const result = await runLoop('FEATURE067-disabled', {
      projectDir,
      dbPath: path.join(projectDir, '.dev-loop', 'dev-loop.db'),
      dependencies: baseDependencies({ successHooks: optionalHooks }),
    });

    expect(result.success).toBe(true);
    expect(optionalHooks.createPullRequest).not.toHaveBeenCalled();
    expect(optionalHooks.updateTicket).not.toHaveBeenCalled();
    expect(optionalHooks.runSmokeTests).not.toHaveBeenCalled();
    expect(optionalHooks.exportFineTuneDataset).not.toHaveBeenCalled();
    expect(optionalHooks.syncObsidian).not.toHaveBeenCalled();
    expect(optionalHooks.updateCalendar).not.toHaveBeenCalled();
  });

  it('Test hook failure is actionable', async () => {
    const projectDir = tempProject();

    await expect(runLoop('FEATURE067-failure', {
      projectDir,
      dbPath: path.join(projectDir, '.dev-loop', 'dev-loop.db'),
      dependencies: baseDependencies({
        successHooks: {
          updateCodeMap: vi.fn(async () => {
            throw new Error('code map locked');
          }),
        },
      }),
    })).rejects.toMatchObject({
      name: 'SuccessHookError',
      code: 'success_hook.failed',
      hookName: 'updateCodeMap',
      action: 'Fix or disable the failing success hook, then rerun the loop.',
    });

    await expect(runLoop('FEATURE067-failure', {
      projectDir,
      dbPath: path.join(projectDir, '.dev-loop', 'second.db'),
      dependencies: baseDependencies({
        successHooks: {
          updateCodeMap: vi.fn(async () => {
            throw new Error('code map locked');
          }),
        },
      }),
    })).rejects.toBeInstanceOf(SuccessHookError);

    const loop = await getLoopDetail(1);
    expect(loop?.success).toBe(0);
  });
});
