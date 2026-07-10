import { describe, expect, it } from 'vitest';
import {
  VramError,
  VramManager,
  suggestQuantization,
  type VramCommandRunner,
} from '../../models/vram.js';

describe('FEATURE046 - VRAM Manager', () => {
  it('detects VRAM on Linux, macOS, and Windows from mocked platform commands', async () => {
    const linux = new VramManager({
      platform: 'linux',
      runCommand: async () => ({ stdout: '8192\n6144\n' }),
    });
    const darwin = new VramManager({
      platform: 'darwin',
      runCommand: async () => ({ stdout: 'Chipset Model: Apple M3\nVRAM (Total): 18 GB\n' }),
    });
    const win32 = new VramManager({
      platform: 'win32',
      runCommand: async () => ({ stdout: 'AdapterRAM\n8589934592\n' }),
    });

    await expect(linux.detect()).resolves.toMatchObject({ totalMb: 8192, availableMb: 6144, source: 'nvidia-smi', reliable: true });
    await expect(darwin.detect()).resolves.toMatchObject({ totalMb: 18432, availableMb: 18432, source: 'system_profiler', reliable: true });
    await expect(win32.detect()).resolves.toMatchObject({ totalMb: 8192, availableMb: 8192, source: 'wmic', reliable: true });
  });

  it('provides a conservative fallback when VRAM commands are unavailable', async () => {
    const runCommand: VramCommandRunner = async () => {
      throw new Error('command not found');
    };
    const manager = new VramManager({ platform: 'linux', runCommand });

    await expect(manager.detect()).resolves.toEqual({
      totalMb: 0,
      availableMb: 0,
      source: 'fallback',
      reliable: false,
      message: 'VRAM could not be detected; assuming no dedicated VRAM is available.',
    });
  });

  it('throws an actionable insufficient VRAM error with quantization suggestions', async () => {
    const manager = new VramManager({
      platform: 'linux',
      runCommand: async () => ({ stdout: '4096\n4096\n' }),
    });

    await expect(manager.assertCanLoad({ model: 'big-local-model', requiredMb: 8192 })).rejects.toMatchObject({
      name: 'VramError',
      code: 'vram.insufficient',
      action: expect.stringContaining('quantization'),
    });
    await expect(manager.assertCanLoad({ model: 'big-local-model', requiredMb: 8192 })).rejects.toBeInstanceOf(VramError);
  });

  it('runs local model load operations sequentially through a lock', async () => {
    const order: string[] = [];
    const manager = new VramManager({
      platform: 'linux',
      runCommand: async () => ({ stdout: '16384\n16384\n' }),
    });

    const first = manager.withModelLoadLock({ model: 'first', requiredMb: 1024 }, async () => {
      order.push('first:start');
      await new Promise(resolve => setTimeout(resolve, 20));
      order.push('first:end');
      return 'first';
    });
    const second = manager.withModelLoadLock({ model: 'second', requiredMb: 1024 }, async () => {
      order.push('second:start');
      order.push('second:end');
      return 'second';
    });

    await expect(Promise.all([first, second])).resolves.toEqual(['first', 'second']);
    expect(order).toEqual(['first:start', 'first:end', 'second:start', 'second:end']);
  });

  it('runs load and unload hooks and does not leave the lock stuck after failure', async () => {
    const hooks: string[] = [];
    const manager = new VramManager({
      platform: 'linux',
      runCommand: async () => ({ stdout: '16384\n16384\n' }),
    });

    await expect(manager.withModelLoadLock({
      model: 'broken',
      requiredMb: 1024,
      onLoad: async model => { hooks.push(`load:${model}`); },
      onUnload: async model => { hooks.push(`unload:${model}`); },
    }, async () => {
      throw new Error('load failed');
    })).rejects.toThrow('load failed');

    await expect(manager.withModelLoadLock({ model: 'next', requiredMb: 1024 }, async () => 'ok')).resolves.toBe('ok');
    expect(hooks).toEqual(['load:broken', 'unload:broken']);
  });

  it('suggests conservative quantization levels from available VRAM', () => {
    expect(suggestQuantization({ availableMb: 3000, modelParameterBillion: 7 })).toEqual(['Q2_K', 'Q3_K_S']);
    expect(suggestQuantization({ availableMb: 9000, modelParameterBillion: 7 })).toContain('Q4_K_M');
  });
});
