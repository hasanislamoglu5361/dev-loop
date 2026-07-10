import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { composeProductionRuntime } from '../runtime/composer.js';
import { createDefaultConfig, loadConfig } from '../config/loader.js';
import type { ModelProvider } from '../models/types.js';

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map(dir => rm(dir, { recursive: true, force: true })));
});

async function setup() {
  const dir = await mkdtemp(path.join(tmpdir(), 'dev-loop-composer-'));
  tempDirs.push(dir);
  const configPath = await createDefaultConfig(dir);
  const config = await loadConfig({ projectDir: dir, configPath });
  return { config, dir };
}

const fakeProvider: ModelProvider = {
  id: 'fake', provider: 'fake', isLocal: true,
  listModels: async () => [{ id: 'deterministic', name: 'Deterministic', provider: 'fake' }],
  healthCheck: async () => ({ ok: true, status: 'healthy', providerId: 'fake', checkedAt: new Date() }),
  generate: async params => ({ text: `generated:${params.messages[0]?.content ?? ''}`, files: [], model: params.model, inputTokens: 2, outputTokens: 3 }),
};

describe('FEATURE101 - Production Runtime Composition', () => {
  it('composes a runtime with default config and wires all dependencies', async () => {
    const { config, dir } = await setup();
    const runtime = await composeProductionRuntime({
      projectDir: dir,
      config,
      checkpointDir: path.join(dir, '.dev-loop/checkpoints'),
      dbPath: path.join(dir, '.dev-loop/dev-loop.db'),
      providers: [fakeProvider],
    });
    expect(runtime.selectedModel.provider).toBeTruthy();
    expect(runtime.selectedVerifier.provider).toBeTruthy();
    expect(runtime.dependencies.generate).toBeDefined();
    expect(runtime.dependencies.buildContext).toBeDefined();
    expect(runtime.successHooks.updateCodeMap).toBeDefined();
    expect(typeof runtime.cleanup).toBe('function');
    await runtime.cleanup();
  });

  it('buildContext includes feature id and loop id', async () => {
    const { config, dir } = await setup();
    const runtime = await composeProductionRuntime({
      projectDir: dir,
      config,
      checkpointDir: path.join(dir, '.dev-loop/checkpoints'),
      dbPath: path.join(dir, '.dev-loop/dev-loop.db'),
      providers: [fakeProvider],
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
    const { config, dir } = await setup();
    const runtime = await composeProductionRuntime({
      projectDir: dir,
      config,
      checkpointDir: path.join(dir, '.dev-loop/checkpoints'),
      dbPath: path.join(dir, '.dev-loop/dev-loop.db'),
      providers: [fakeProvider],
    });
    const result = await runtime.dependencies.generate!({
      context: 'Implement feature X',
      model: { provider: 'fake', model: 'deterministic' },
      config,
    });
    expect(result.text.length).toBeGreaterThan(0);
    expect(result.inputTokens).toBeGreaterThan(0);
    expect(result.outputTokens).toBeGreaterThan(0);
    await runtime.cleanup();
  });
});
