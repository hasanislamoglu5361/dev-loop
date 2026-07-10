import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { closeDatabase } from '../../db/connection.js';
import { getLoopDetail, getLoopTurns } from '../../db/queries/index.js';
import { findLatestResumableLoop, replayLoop, resumeLoop, runLoop } from '../../runtime/engine.js';
import type { LoopEngineDependencies } from '../../runtime/engine.js';
import { cleanupTempProject, createTempProject } from '../helpers/temp-dir.js';

const projects: string[] = [];

afterEach(() => {
  closeDatabase();
  projects.splice(0).forEach(cleanupTempProject);
});

function dependencies(generate: ReturnType<typeof vi.fn>): LoopEngineDependencies {
  return {
    selectModel: () => ({ provider: 'fake', model: 'deterministic' }),
    selectVerifier: () => ({ provider: 'fake', model: 'reviewer' }),
    buildContext: request => `turn ${request.turn}`,
    generate,
    testRunner: {
      run: async request => ({
        runner: 'command', success: true, status: 'passed', command: 'fake-test', args: [], exitCode: 0,
        stdout: 'passed', stderr: '', summary: 'passed', changedFiles: request.changedFiles ?? [],
      }),
    },
  };
}

describe('FEATURE103 - engine resume', () => {
  it('continues the same loop from the next turn without repeating turn one', async () => {
    const projectDir = createTempProject('dev-loop-resume-');
    projects.push(projectDir);
    const dbPath = path.join(projectDir, '.dev-loop', 'dev-loop.db');
    const generate = vi.fn(async ({ context }: { context: string }) => ({ text: context, inputTokens: 1, outputTokens: 1 }));
    const deps = dependencies(generate);

    const first = await runLoop('FEATURE103', { projectDir, dbPath, dependencies: deps });
    expect(first.turns.map(turn => turn.turnNumber)).toEqual([1]);
    await expect(findLatestResumableLoop(projectDir)).resolves.toBe(first.loopId);

    const resumed = await resumeLoop({ projectDir, dbPath, loopId: first.loopId, dependencies: deps });

    expect(resumed.loopId).toBe(first.loopId);
    expect(resumed.turns.map(turn => turn.turnNumber)).toEqual([1, 2]);
    expect(generate).toHaveBeenCalledTimes(2);
    await expect(getLoopTurns(first.loopId)).resolves.toHaveLength(2);
  });

  it('creates a linked replay and preserves recorded selections', async () => {
    const projectDir = createTempProject('dev-loop-replay-');
    projects.push(projectDir);
    const dbPath = path.join(projectDir, '.dev-loop', 'dev-loop.db');
    const generate = vi.fn(async ({ context }: { context: string }) => ({ text: context }));
    const deps = dependencies(generate);
    const source = await runLoop('FEATURE103-replay', { projectDir, dbPath, dependencies: deps });

    await expect(replayLoop({ projectDir, dbPath, sourceLoopId: source.loopId, dryRun: true })).resolves.toMatchObject({
      dryRun: true,
      sourceLoopId: source.loopId,
      selectedModel: source.selectedModel,
      selectedVerifier: source.selectedVerifier,
    });

    const replay = await replayLoop({ projectDir, dbPath, sourceLoopId: source.loopId, dependencies: deps });
    await expect(getLoopDetail(replay.loopId)).resolves.toMatchObject({ source_loop_id: source.loopId });
    expect(replay.selectedModel).toEqual(source.selectedModel);
  });
});
