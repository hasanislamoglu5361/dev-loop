import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import { ProjectLoopController } from '../loop-controller.js';

describe('FEATURE118 project loop controller', () => {
  it('serializes project operations and publishes persisted state changes', async () => {
    const realtime = new EventEmitter(); const events: unknown[] = []; realtime.on('event', event => events.push(event));
    let release!: () => void; const pending = new Promise<void>(resolve => { release = resolve; });
    const controller = new ProjectLoopController({ projectId: '/project', realtime, persist: vi.fn() });
    const first = controller.execute('run', 'op-1', async () => { await pending; return { ok: true }; });
    await vi.waitFor(() => expect(controller.snapshot().state).toBe('running'));
    await expect(controller.execute('run', 'op-2', async () => undefined)).rejects.toThrow('active operation');
    release(); await expect(first).resolves.toEqual({ ok: true });
    expect(events).toEqual([expect.objectContaining({ state: 'running' }), expect.objectContaining({ state: 'completed' })]);
  });

  it('supports safe pause, resume and cancellation with AbortSignal cleanup', async () => {
    const controller = new ProjectLoopController({ projectId: '/project' }); let signal!: AbortSignal; let rejectOperation!: (error: Error) => void;
    const run = controller.execute('run', 'op-1', async input => { signal = input; return new Promise((_resolve, reject) => { rejectOperation = reject; input.addEventListener('abort', () => reject(new Error('aborted'))); }); });
    await vi.waitFor(() => expect(controller.snapshot().state).toBe('running'));
    await expect(controller.execute('pause', 'control', async () => undefined)).resolves.toEqual({ state: 'paused' });
    await expect(controller.execute('resume', 'control', async () => undefined)).resolves.toEqual({ state: 'running' });
    await expect(controller.execute('cancel', 'control', async () => undefined)).resolves.toEqual({ state: 'cancelled' });
    expect(signal.aborted).toBe(true); await expect(run).rejects.toThrow('aborted'); void rejectOperation;
  });
});
