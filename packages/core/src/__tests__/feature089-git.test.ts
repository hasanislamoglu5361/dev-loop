import { describe, expect, it, vi } from 'vitest';
import { SafeGit } from '../git/safe-git.js';

describe('FEATURE089 - Git Integration', () => {
  it('Test diff and commit', async () => {
    const git = {
      status: vi.fn(async () => ({ files: [{ path: 'src/a.ts' }, { path: '.dev-loop/dev-loop.db' }] })),
      diff: vi.fn(async () => 'diff --git a/src/a.ts b/src/a.ts'),
      checkoutLocalBranch: vi.fn(async () => undefined),
      add: vi.fn(async () => undefined),
      commit: vi.fn(async () => ({ commit: 'abc123' })),
      raw: vi.fn(),
    };
    const safeGit = new SafeGit({ git });

    await expect(safeGit.diff()).resolves.toBe('diff --git a/src/a.ts b/src/a.ts');
    await expect(safeGit.commit({ message: 'feat: update', files: ['src/a.ts', '.dev-loop/dev-loop.db'] })).resolves.toEqual({
      commit: 'abc123',
      files: ['src/a.ts'],
    });
    expect(git.add).toHaveBeenCalledWith(['src/a.ts']);
    expect(git.commit).toHaveBeenCalledWith('feat: update');
  });

  it('Test dirty working tree handling', async () => {
    const git = {
      status: vi.fn(async () => ({ files: [{ path: 'src/dirty.ts' }] })),
      diff: vi.fn(),
      checkoutLocalBranch: vi.fn(),
      add: vi.fn(),
      commit: vi.fn(),
      raw: vi.fn(),
    };
    const safeGit = new SafeGit({ git });

    await expect(safeGit.createBranch('feature/test')).rejects.toThrow('Working tree is dirty');
    expect(git.checkoutLocalBranch).not.toHaveBeenCalled();
  });

  it('Test rollback does not use destructive commands without explicit config', async () => {
    const git = {
      status: vi.fn(async () => ({ files: [] })),
      diff: vi.fn(),
      checkoutLocalBranch: vi.fn(),
      add: vi.fn(),
      commit: vi.fn(),
      raw: vi.fn(),
    };
    const safeGit = new SafeGit({ git });

    await expect(safeGit.rollback({ ref: 'HEAD~1' })).resolves.toEqual({
      rolledBack: false,
      reason: 'Destructive rollback disabled.',
    });
    expect(git.raw).not.toHaveBeenCalled();

    await expect(safeGit.rollback({ ref: 'HEAD~1', allowDestructive: true })).resolves.toEqual({
      rolledBack: true,
      ref: 'HEAD~1',
    });
    expect(git.raw).toHaveBeenCalledWith(['reset', '--hard', 'HEAD~1']);
  });
});
