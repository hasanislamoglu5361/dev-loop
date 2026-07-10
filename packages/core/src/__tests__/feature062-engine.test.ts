import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { closeDatabase, getDatabase } from '../db/connection.js';
import { getLoopDetail, getLoopTurns } from '../db/queries/index.js';
import { runLoop } from '../runtime/engine.js';
import { cleanupTempProject, createTempProject } from './helpers/temp-dir.js';

const tempProjects: string[] = [];

function tempProject(): string {
  const projectDir = createTempProject('dev-loop-engine-');
  tempProjects.push(projectDir);
  return projectDir;
}

describe('FEATURE062 - loop engine initialization', () => {
  afterEach(() => {
    closeDatabase();
    while (tempProjects.length > 0) {
      cleanupTempProject(tempProjects.pop() as string);
    }
  });

  it('Test initialization creates loop record', async () => {
    const projectDir = tempProject();
    const dbPath = path.join(projectDir, '.dev-loop', 'dev-loop.db');
    const selectModel = vi.fn(() => ({ provider: 'fake-model-provider', model: 'fake-model' }));
    const selectVerifier = vi.fn(() => ({ provider: 'fake-verifier-provider', model: 'fake-verifier' }));

    const result = await runLoop('FEATURE062', {
      projectDir,
      dbPath,
      featureSummary: 'Initialize loop engine',
      dependencies: { selectModel, selectVerifier },
    });

    expect(result).toMatchObject({
      featureId: 'FEATURE062',
      loopId: expect.any(Number),
      initialized: true,
      selectedModel: { provider: 'fake-model-provider', model: 'fake-model' },
      selectedVerifier: { provider: 'fake-verifier-provider', model: 'fake-verifier' },
    });

    const loop = await getLoopDetail(result.loopId);
    expect(loop).toMatchObject({
      feature_id: 'FEATURE062',
      feature_summary: 'Initialize loop engine',
      primary_model: 'fake-model',
      primary_provider: 'fake-model-provider',
      verifier_model: 'fake-verifier',
      verifier_provider: 'fake-verifier-provider',
    });

    expect(fs.existsSync(result.checkpointPath)).toBe(true);
    const checkpoint = JSON.parse(fs.readFileSync(result.checkpointPath, 'utf8')) as Record<string, unknown>;
    expect(checkpoint).toMatchObject({
      loopId: String(result.loopId),
      turn: 0,
      state: {
        phase: 'initialized',
        featureId: 'FEATURE062',
      },
    });
    expect(result.cost.total).toBe(0);
    expect(result.time.startedAt).toEqual(expect.any(String));
    expect(getDatabase().open).toBe(true);
  });

  it('Test missing config falls back to defaults', async () => {
    const projectDir = tempProject();
    const selectModel = vi.fn(config => ({
      provider: config.coding.primary.provider,
      model: config.coding.primary.model,
    }));
    const selectVerifier = vi.fn(config => ({
      provider: config.verifier.provider,
      model: config.verifier.model,
    }));

    const result = await runLoop('FEATURE062-defaults', {
      projectDir,
      dbPath: path.join(projectDir, '.dev-loop', 'dev-loop.db'),
      dependencies: { selectModel, selectVerifier },
    });

    expect(result.config.version).toBe('1');
    expect(result.config.test_runner.command).toBe('pytest');
    expect(selectModel).toHaveBeenCalledWith(result.config);
    expect(selectVerifier).toHaveBeenCalledWith(result.config);
    expect(result.selectedModel).toEqual({ provider: 'auto', model: 'auto' });
    expect(result.selectedVerifier).toEqual({
      provider: 'claude-code-cli',
      model: 'claude-sonnet-4-6',
    });
  });

  it('Test successful single turn', async () => {
    const projectDir = tempProject();
    const buildContext = vi.fn(async () => 'context for one turn');
    const generate = vi.fn(async () => ({
      text: [
        'Here is the change.',
        '```ts',
        '// FILE: src/generated.ts',
        'export const generated = true;',
        '```',
      ].join('\n'),
      inputTokens: 1000,
      outputTokens: 500,
    }));
    const testRunner = {
      run: vi.fn(async () => ({
        runner: 'none' as const,
        success: true,
        status: 'passed' as const,
        args: [],
        exitCode: 0,
        stdout: '1 passed\n',
        stderr: '',
        summary: '1 passed',
        changedFiles: ['src/generated.ts'],
      })),
    };

    const result = await runLoop('FEATURE063', {
      projectDir,
      dbPath: path.join(projectDir, '.dev-loop', 'dev-loop.db'),
      dependencies: {
        selectModel: () => ({ provider: 'openrouter', model: 'openai/gpt-4o' }),
        selectVerifier: () => ({ provider: 'fake-verifier', model: 'reviewer' }),
        buildContext,
        generate,
        testRunner,
      },
    });

    expect(result.turn).toMatchObject({
      turnNumber: 1,
      success: true,
      generatedFiles: ['src/generated.ts'],
      testSummary: '1 passed',
    });
    expect(buildContext).toHaveBeenCalledWith(expect.objectContaining({
      featureId: 'FEATURE063',
      turn: 1,
      loopId: result.loopId,
    }));
    expect(generate).toHaveBeenCalledWith(expect.objectContaining({
      context: 'context for one turn',
      model: { provider: 'openrouter', model: 'openai/gpt-4o' },
    }));
    expect(testRunner.run).toHaveBeenCalledWith(expect.objectContaining({
      changedFiles: ['src/generated.ts'],
    }));

    const writtenFile = path.join(projectDir, '.dev-loop', 'sandbox', 'src', 'generated.ts');
    expect(fs.readFileSync(writtenFile, 'utf8')).toBe('export const generated = true;\n');

    const turns = await getLoopTurns(result.loopId);
    expect(turns).toHaveLength(1);
    expect(turns[0]).toMatchObject({
      turn_number: 1,
      agent: 'primary',
      model: 'openai/gpt-4o',
      input_tokens: 1000,
      output_tokens: 500,
      success: 1,
    });
    expect(turns[0]?.cost_usd).toBeGreaterThan(0);
    expect(JSON.parse(String(turns[0]?.files_changed))).toEqual(['src/generated.ts']);

    const loop = await getLoopDetail(result.loopId);
    expect(loop?.success).toBe(0);
    expect(result.cost.total).toBeGreaterThan(0);
  });

  it('Test test failure writes BUGSmd', async () => {
    const projectDir = tempProject();
    const testRunner = {
      run: vi.fn(async () => ({
        runner: 'command' as const,
        success: false,
        status: 'failed' as const,
        command: 'npm',
        args: ['test'],
        exitCode: 1,
        stdout: '0 passed\n',
        stderr: 'expected failure\n',
        summary: 'expected failure',
        changedFiles: ['src/broken.ts'],
      })),
    };

    const result = await runLoop('FEATURE063-failure', {
      projectDir,
      dbPath: path.join(projectDir, '.dev-loop', 'dev-loop.db'),
      dependencies: {
        selectModel: () => ({ provider: 'local', model: 'fake-coder' }),
        selectVerifier: () => ({ provider: 'fake-verifier', model: 'reviewer' }),
        buildContext: async () => 'context',
        generate: async () => ({
          text: [
            '```ts',
            '// FILE: src/broken.ts',
            'export const broken = true;',
            '```',
          ].join('\n'),
          inputTokens: 0,
          outputTokens: 0,
        }),
        testRunner,
      },
    });

    expect(result.turn).toMatchObject({
      success: false,
      testSummary: 'expected failure',
    });
    const bugs = fs.readFileSync(path.join(projectDir, '.dev-loop', 'BUGS.md'), 'utf8');
    expect(bugs).toContain('FEATURE063-failure');
    expect(bugs).toContain('expected failure');
    expect(bugs).toContain('expected failure');

    const turns = await getLoopTurns(result.loopId);
    expect(turns[0]).toMatchObject({
      success: 0,
      error_message: 'expected failure',
      error_type: 'test_failure',
    });
    const loop = await getLoopDetail(result.loopId);
    expect(loop?.success).toBe(0);
  });
});
