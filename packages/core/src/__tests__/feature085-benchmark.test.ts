import { describe, expect, it, vi } from 'vitest';
import { runBenchmarks } from '../benchmark/runner.js';

describe('FEATURE085 - Benchmark Runner', () => {
  it('Test two models sequential', async () => {
    const order: string[] = [];
    const result = await runBenchmarks({
      models: [
        { id: 'model-a', provider: 'api' },
        { id: 'model-b', provider: 'api' },
      ],
      runLoop: vi.fn(async model => {
        order.push(`start:${model.id}`);
        order.push(`end:${model.id}`);
        return { success: true, turns: 1, costUsd: 0.1 };
      }),
      isolateRun: vi.fn(async model => { order.push(`isolate:${model.id}`); }),
      saveResults: vi.fn(),
      now: (() => {
        let value = 0;
        return () => value++;
      })(),
    });

    expect(order).toEqual([
      'isolate:model-a',
      'start:model-a',
      'end:model-a',
      'isolate:model-b',
      'start:model-b',
      'end:model-b',
    ]);
    expect(result.results.map(item => item.modelId)).toEqual(['model-a', 'model-b']);
  });

  it('Test local unload in finally', async () => {
    const unload = vi.fn(async () => undefined);

    await expect(runBenchmarks({
      models: [{ id: 'local-a', provider: 'ollama', local: true }],
      vram: {
        canLoad: vi.fn(async () => true),
        load: vi.fn(async () => undefined),
        unload,
      },
      runLoop: vi.fn(async () => {
        throw new Error('loop failed');
      }),
      isolateRun: vi.fn(async () => undefined),
      saveResults: vi.fn(),
      now: () => 1,
    })).resolves.toMatchObject({
      results: [
        expect.objectContaining({ modelId: 'local-a', status: 'failed' }),
      ],
    });
    expect(unload).toHaveBeenCalledWith({ id: 'local-a', provider: 'ollama', local: true });
  });

  it('Test VRAM skip', async () => {
    const runLoop = vi.fn();
    const saveResults = vi.fn();

    const result = await runBenchmarks({
      models: [{ id: 'too-big', provider: 'ollama', local: true, requiredVramMb: 999999 }],
      vram: {
        canLoad: vi.fn(async () => false),
        load: vi.fn(),
        unload: vi.fn(),
      },
      runLoop,
      isolateRun: vi.fn(),
      saveResults,
      now: () => 1,
    });

    expect(result.results).toEqual([
      expect.objectContaining({
        modelId: 'too-big',
        status: 'skipped',
        reason: 'Insufficient VRAM.',
      }),
    ]);
    expect(runLoop).not.toHaveBeenCalled();
    expect(saveResults).toHaveBeenCalledWith(result.results);
  });
});
