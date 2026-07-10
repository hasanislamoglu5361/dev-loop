import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import { CheckpointError, CheckpointManager } from '../../runtime/checkpoints.js';

describe('FEATURE057 - Checkpoint Manager', () => {
  it('saves checkpoint state atomically and restores by turn', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'dev-loop-checkpoint-'));
    const manager = new CheckpointManager({ checkpointDir: dir });

    await manager.save({ version: 1, loopId: 'loop-a', turn: 1, state: { step: 'coding', files: ['a.ts'] } });

    await expect(manager.restore('loop-a', 1)).resolves.toEqual({
      version: 1,
      loopId: 'loop-a',
      turn: 1,
      state: { step: 'coding', files: ['a.ts'] },
    });
  });

  it('restores latest checkpoint using numeric turn order', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'dev-loop-checkpoint-'));
    const manager = new CheckpointManager({ checkpointDir: dir });

    await manager.save({ version: 1, loopId: 'loop-a', turn: 2, state: { value: 'two' } });
    await manager.save({ version: 1, loopId: 'loop-a', turn: 10, state: { value: 'ten' } });

    await expect(manager.restoreLatest('loop-a')).resolves.toMatchObject({
      turn: 10,
      state: { value: 'ten' },
    });
  });

  it('handles corrupt JSON with an actionable checkpoint error', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'dev-loop-checkpoint-'));
    const manager = new CheckpointManager({ checkpointDir: dir });
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, 'loop-a-turn-1.json'), '{broken');

    await expect(manager.restore('loop-a', 1)).rejects.toMatchObject({
      name: 'CheckpointError',
      code: 'checkpoint.error',
      action: expect.stringContaining('Delete'),
    });
    await expect(manager.restore('loop-a', 1)).rejects.toBeInstanceOf(CheckpointError);
  });

  it('rejects legacy unversioned checkpoints actionably', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'dev-loop-checkpoint-'));
    const manager = new CheckpointManager({ checkpointDir: dir });
    await fs.writeFile(path.join(dir, 'loop-a-turn-1.json'), JSON.stringify({ loopId: 'loop-a', turn: 1, state: {} }));

    await expect(manager.restore('loop-a', 1)).rejects.toMatchObject({
      name: 'CheckpointError',
      action: expect.stringContaining('Migrate'),
      details: expect.objectContaining({ reason: expect.stringContaining('legacy') }),
    });
  });

  it('clears checkpoints for one loop without deleting other loops', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'dev-loop-checkpoint-'));
    const manager = new CheckpointManager({ checkpointDir: dir });

    await manager.save({ version: 1, loopId: 'loop-a', turn: 1, state: {} });
    await manager.save({ version: 1, loopId: 'loop-b', turn: 1, state: {} });

    await expect(manager.clear('loop-a')).resolves.toBe(1);
    await expect(manager.restore('loop-a', 1)).resolves.toBeNull();
    await expect(manager.restore('loop-b', 1)).resolves.toMatchObject({ loopId: 'loop-b' });
  });
});
