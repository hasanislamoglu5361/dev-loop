import { EventEmitter } from 'node:events';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { PassThrough } from 'node:stream';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createDefaultConfig,
  initProjectRuntime,
  loadConfig,
} from '../index.js';
import {
  estimateCost,
  countTokens,
  globFiles,
  readFileSafe,
  resolveProjectPath,
  retryWithBackoff,
  runProcess,
  withTimeout,
  writeFileAtomic,
} from '../utils/index.js';
import type { SpawnLike } from '../utils/index.js';

class FakeChildProcess extends EventEmitter {
  stdout = new PassThrough();
  stderr = new PassThrough();
  kill = vi.fn();
}

function createSuccessfulSpawn(stdout: string): SpawnLike {
  return vi.fn(() => {
    const child = new FakeChildProcess();
    queueMicrotask(() => {
      child.stdout.write(stdout);
      child.stdout.end();
      child.stderr.end();
      child.emit('close', 0);
    });
    return child;
  });
}

describe('FEATURE040 - utility integration pass', () => {
  let tempProject: string | undefined;

  afterEach(async () => {
    if (tempProject) {
      await fs.rm(tempProject, { recursive: true, force: true });
      tempProject = undefined;
    }
  });

  it('uses runtime, config, file, token, cost, and process helpers together in a temp project', async () => {
    tempProject = await fs.mkdtemp(path.join(os.tmpdir(), 'dev-loop-utils-integration-'));

    const runtime = initProjectRuntime(tempProject);
    const configPath = await createDefaultConfig(tempProject);
    const config = await loadConfig({ projectDir: tempProject });

    const safeFile = resolveProjectPath(tempProject, '.dev-loop/sandbox/result.txt');
    await writeFileAtomic(safeFile.absolutePath, 'hello from utilities');
    const content = await readFileSafe(safeFile.absolutePath);
    const files = await globFiles('**/*.txt', {
      cwd: tempProject,
      excludeGenerated: true,
      dot: true,
    });

    const tokenCount = await countTokens(content, { model: config.planning.primary.model });
    const cost = estimateCost(tokenCount, 5, 'openai', 'gpt-4o-mini');
    const timed = await withTimeout(Promise.resolve('timed-ok'), 50);
    const retried = await retryWithBackoff(
      async () => 'retried-ok',
      { retries: 1, baseDelayMs: 0 },
    );
    const processResult = await runProcess('fake-tool', ['--version'], {
      spawn: createSuccessfulSpawn('fake-tool 1.0\n'),
    });

    expect(runtime.runtimeRoot).toBe(path.join(tempProject, '.dev-loop'));
    expect(configPath).toBe(path.join(tempProject, 'dev-loop.yaml'));
    expect(config.version).toBe('1');
    expect(content).toBe('hello from utilities');
    expect(files).toContain('.dev-loop/sandbox/result.txt');
    expect(tokenCount).toBeGreaterThan(0);
    expect(cost.totalCostUsd).toBeGreaterThanOrEqual(0);
    expect(timed).toBe('timed-ok');
    expect(retried).toBe('retried-ok');
    expect(processResult.stdout).toBe('fake-tool 1.0\n');
  });
});
