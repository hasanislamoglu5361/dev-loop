import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { closeDatabase, initDatabase } from '../db/connection.js';
import { getLoopDetail, getLoopTurns } from '../db/queries/index.js';
import { runLoop } from '../runtime/engine.js';
import { composeProductionRuntime } from '../runtime/composer.js';
import { createDefaultConfig, loadConfig } from '../config/loader.js';
import { readFile } from 'node:fs/promises';
import type { ModelProvider, ProviderHealth } from '../models/types.js';
import { existsSync } from 'node:fs';

const tempDirs: string[] = [];

function makeProject(prefix: string): string {
  const dir = fs.mkdtempSync(path.join(require('node:os').tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

async function setupProject(prefix: string) {
  const dir = makeProject(prefix);
  const configPath = await createDefaultConfig(dir);
  const config = await loadConfig({ projectDir: dir, configPath });
  // Make every relevant section deterministic + bounded so the composed runtime
  // runs a single, in-process provider for both coding and verification.
  const deterministic: typeof config = {
    ...config,
    coding: {
      ...config.coding,
      primary: { ...config.coding.primary, provider: 'fake', model: 'fake-model', auto_select: false },
    },
    verifier: {
      ...config.verifier,
      provider: 'api',
      model: 'fake-model',
    },
    loop: {
      ...config.loop,
      max_retry: 1,
      sandbox_mode: true,
      cost_budget_usd: 1.0,
      time_budget_minutes: 5,
    },
    test_runner: { ...config.test_runner, type: 'none' },
    quality_gate: { ...config.quality_gate, enabled: false },
    notifications: {
      ...config.notifications,
      desktop: { ...config.notifications.desktop, enabled: false, events: [] },
    },
  } as typeof config;
  return { dir, config: deterministic };
}

const coderResponse = '```ts\n// FILE: generated.ts\nexport const generated = true;\n```';
const cleanVerifierOutput = '```json\n{"bugs":[],"confidence":1,"mcp_score":100,"uncertain_fields":[],"summary":"clean"}\n```';

function makeFakeProvider(): ModelProvider & {
  generationCount: number;
  listModelsCount: number;
  disposeCount: number;
} {
  let disposed = false;
  const fake = {
    id: 'fake',
    provider: 'fake',
    isLocal: true,
    generationCount: 0,
    listModelsCount: 0,
    disposeCount: 0,
    listModels: async () => {
      fake.listModelsCount += 1;
      if (disposed) throw new Error('fake provider is disposed');
      return [{ id: 'fake-model', name: 'Fake Model', provider: 'fake', isLocal: true }];
    },
    healthCheck: async (): Promise<ProviderHealth> => ({
      ok: true,
      status: 'healthy',
      providerId: 'fake',
      checkedAt: new Date(),
    }),
    generate: async (params: Parameters<ModelProvider['generate']>[0]) => {
      fake.generationCount += 1;
      if (disposed) throw new Error('fake provider is disposed');
      // First call is coding, subsequent calls are verifier review.
      const isReview = params.messages[0]?.content?.startsWith('# Verifier Review:');
      const text = isReview ? cleanVerifierOutput : coderResponse;
      return {
        text,
        files: [],
        model: params.model,
        inputTokens: 4,
        outputTokens: 5,
        finishReason: 'stop',
      };
    },
    dispose: async () => {
      fake.disposeCount += 1;
      disposed = true;
    },
  } as unknown as ModelProvider & {
    generationCount: number;
    listModelsCount: number;
    disposeCount: number;
  };
  return fake;
}

afterEach(async () => {
  closeDatabase();
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop() as string;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

beforeEach(() => {
  closeDatabase();
});

describe('FEATURE101 - Production Runtime Composition', () => {
  it('composes a runtime with default config and wires all dependencies', async () => {
    const configPath = await createDefaultConfig(makeProject('dev-loop-composer-'));
    const config = await loadConfig({ projectDir: tempDirs[tempDirs.length - 1], configPath });
    const fake = makeFakeProvider();
    const runtime = await composeProductionRuntime({
      projectDir: tempDirs[tempDirs.length - 1],
      config,
      checkpointDir: path.join(tempDirs[tempDirs.length - 1], '.dev-loop/checkpoints'),
      dbPath: path.join(tempDirs[tempDirs.length - 1], '.dev-loop/dev-loop.db'),
      providers: [fake],
    });
    expect(runtime.selectedModel.provider).toBeTruthy();
    expect(runtime.selectedVerifier.provider).toBeTruthy();
    expect(runtime.dependencies.generate).toBeDefined();
    expect(runtime.dependencies.buildContext).toBeDefined();
    expect(runtime.successHooks.updateCodeMap).toBeDefined();
    expect(runtime.boundedProviders).toHaveLength(1);
    expect(runtime.boundedProviders[0]?.bounded).toBe(true);
    expect(typeof runtime.cleanup).toBe('function');
    await runtime.cleanup();
  });

  it('buildContext includes feature id and loop id', async () => {
    const dir = makeProject('dev-loop-composer-ctx-');
    const configPath = await createDefaultConfig(dir);
    const config = await loadConfig({ projectDir: dir, configPath });
    const fake = makeFakeProvider();
    const runtime = await composeProductionRuntime({
      projectDir: dir,
      config,
      checkpointDir: path.join(dir, '.dev-loop/checkpoints'),
      dbPath: path.join(dir, '.dev-loop/dev-loop.db'),
      providers: [fake],
    });
    const ctx = await runtime.dependencies.buildContext!({
      featureId: 'FEATURE999',
      loopId: 7,
      turn: 2,
      config,
      bugs: [],
      focusFiles: [],
    });
    expect(ctx).toContain('FEATURE999');
    expect(ctx).toContain('7');
    await runtime.cleanup();
  });

  it('generate returns text with non-zero tokens', async () => {
    const dir = makeProject('dev-loop-composer-gen-');
    const configPath = await createDefaultConfig(dir);
    const config = await loadConfig({ projectDir: dir, configPath });
    const fake = makeFakeProvider();
    const runtime = await composeProductionRuntime({
      projectDir: dir,
      config,
      checkpointDir: path.join(dir, '.dev-loop/checkpoints'),
      dbPath: path.join(dir, '.dev-loop/dev-loop.db'),
      providers: [fake],
    });
    const selected = await runtime.dependencies.selectModel?.(config);
    const result = await runtime.dependencies.generate!({
      context: 'Implement feature X',
      model: selected ?? { provider: 'fake', model: 'fake-model' },
      config,
    });
    expect(result.text.length).toBeGreaterThan(0);
    expect(result.inputTokens).toBeGreaterThan(0);
    expect(result.outputTokens).toBeGreaterThan(0);
    await runtime.cleanup();
  });

  it('FEATURE101 regression: composed runtime drives runLoop through generation, file application, tests, verification, persistence, and verified final status', async () => {
    const { dir, config } = await setupProject('dev-loop-composer-e2e-');
    const dbPath = path.join(dir, '.dev-loop/dev-loop.db');
    const checkpointDir = path.join(dir, '.dev-loop/checkpoints');
    initDatabase(dbPath);

    const fake = makeFakeProvider();
    const composed = await composeProductionRuntime({
      projectDir: dir,
      config,
      checkpointDir,
      dbPath,
      providers: [fake],
    });

    // Compose exposes exactly one bounded provider and the runtime should drive
    // both the coding pass and the verifier through it. This proves the composer
    // output is actually consumed by the loop engine end to end.
    expect(composed.boundedProviders).toHaveLength(1);
    expect(composed.selectedModel).toEqual({ provider: 'fake', model: 'fake-model' });
    expect(composed.selectedVerifier.provider).toBe('api');

    const result = await runLoop('FEATURE101', {
      projectDir: dir,
      dbPath,
      checkpointDir,
      config,
      featureSummary: 'Compose production runtime end-to-end',
      dependencies: composed.dependencies,
    });

    // Final status must report success and the verified exit reason.
    expect(result.success).toBe(true);
    expect(result.exitReason).toBe('verified');
    expect(result.turns.length).toBeGreaterThanOrEqual(1);
    const lastTurn = result.turns[result.turns.length - 1];
    expect(lastTurn?.success).toBe(true);
    expect(lastTurn?.generatedFiles).toContain('generated.ts');

    // Safe file application: the file must land inside the sandbox with the
    // generated content; the bounded adapter cannot have crashed mid-write.
    const sandboxFile = path.join(dir, '.dev-loop', 'sandbox', 'generated.ts');
    expect(existsSync(sandboxFile)).toBe(true);
    expect(await readFile(sandboxFile, 'utf8')).toContain('export const generated = true');

    // Tests ran (none runner reports success) and verifier returned clean.
    expect(lastTurn?.testSummary).toMatch(/passed|disabled/);
    expect(result.notificationErrors).toEqual([]);

    // Persistence: loop + turn records land in the SQLite DB before cleanup.
    const persistedLoop = await getLoopDetail(result.loopId);
    expect(persistedLoop?.feature_id).toBe('FEATURE101');
    expect(persistedLoop?.completed_at).not.toBeNull();
    const turns = await getLoopTurns(result.loopId);
    expect(turns.length).toBe(result.turns.length);
    expect(turns[0]?.model).toBe('fake-model');
    expect(existsSync(dbPath)).toBe(true);

    // Bounded adapter guarantees: provider was invoked a bounded number of times
    // (one coding pass + one verifier review) and the cleanup hook disposes it.
    expect(fake.generationCount).toBe(2);
    expect(fake.disposeCount).toBe(0);
    await composed.cleanup();
    expect(fake.disposeCount).toBe(1);
    await expect(
      (fake as unknown as { listModels: () => Promise<unknown> }).listModels(),
    ).rejects.toThrow(/disposed/);
  });

  it('boundedProvider rejects generate calls that exceed the configured timeout', async () => {
    const { boundedProvider } = await import('../runtime/bounded-provider.js');
    const slowProvider: ModelProvider = {
      id: 'slow',
      provider: 'slow',
      isLocal: true,
      listModels: async () => [],
      healthCheck: async () => ({ ok: true, status: 'healthy', providerId: 'slow', checkedAt: new Date() }),
      generate: () => new Promise(resolve => setTimeout(() => resolve({ text: '', files: [], model: 'slow' }), 200)),
    };
    const bounded = boundedProvider(slowProvider, { timeoutMs: 25 });
    await expect(bounded.generate({
      model: 'slow',
      messages: [{ role: 'user', content: 'slow request' }],
    })).rejects.toThrow(/exceeded 25ms/);
    await bounded.dispose();
  });

  it('boundedProvider tracks generation counts and refuses calls after dispose', async () => {
    const { boundedProvider } = await import('../runtime/bounded-provider.js');
    const base: ModelProvider = {
      id: 't',
      provider: 't',
      isLocal: true,
      listModels: async () => [{ id: 't-model', name: 'T', provider: 't' }],
      healthCheck: async () => ({ ok: true, status: 'healthy', providerId: 't', checkedAt: new Date() }),
      generate: async ({ model }) => ({ text: 'ok', files: [], model }),
    };
    const bounded = boundedProvider(base);
    expect(bounded.generationCount()).toBe(0);
    expect(bounded.listModelsCount()).toBe(0);
    await bounded.generate({ model: 't-model', messages: [{ role: 'user', content: 'a' }] });
    expect(bounded.generationCount()).toBe(1);
    await bounded.listModels();
    expect(bounded.listModelsCount()).toBe(1);
    await bounded.dispose();
    await expect(bounded.generate({ model: 't-model', messages: [{ role: 'user', content: 'a' }] }))
      .rejects.toThrow(/disposed/);
    await expect(bounded.listModels()).rejects.toThrow(/disposed/);
  });
});
