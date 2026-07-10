import { createHash } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { PassThrough } from 'node:stream';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { assessFlakyTests, orderRelatedTests, runTestIntelligence } from '../runtime/test-intelligence.js';
import type { SpawnLike } from '../utils/process.js';

const dirs: string[] = [];
afterEach(() => dirs.splice(0).forEach(dir => rmSync(dir, { recursive: true, force: true })));

function fakeSpawn(exitCode = 0, stdout = '', stderr = ''): SpawnLike {
  return vi.fn(() => {
    const child = new EventEmitter() as EventEmitter & { stdout: PassThrough; stderr: PassThrough; kill: () => boolean };
    child.stdout = new PassThrough();
    child.stderr = new PassThrough();
    child.kill = () => true;
    queueMicrotask(() => { child.stdout.end(stdout); child.stderr.end(stderr); child.emit('close', exitCode); });
    return child;
  });
}

describe('FEATURE105 test intelligence', () => {
  it('stably prioritizes related tests', () => {
    expect(orderRelatedTests(['src/billing-service.ts'], [
      'test/auth.test.ts', 'test/billing-service.test.ts', 'test/billing-api.test.ts',
    ])).toEqual(['test/billing-service.test.ts', 'test/billing-api.test.ts', 'test/auth.test.ts']);
  });

  it('applies explicit sample and failure-rate thresholds', () => {
    expect(assessFlakyTests([
      { testName: 'unstable', passCount: 8, failCount: 2 },
      { testName: 'always-fails', passCount: 0, failCount: 10 },
      { testName: 'too-new', passCount: 2, failCount: 1 },
    ], 5, 0.1).map(item => item.flaky)).toEqual([true, false, false]);
  });

  it('reports unsupported mutation testing honestly', async () => {
    const result = await runTestIntelligence({ projectDir: '/tmp', mutation: { enabled: true } });
    expect(result.mutation).toMatchObject({ status: 'unsupported', exitCode: null });
  });

  it('runs a configured mutation command through the process boundary', async () => {
    const spawn = fakeSpawn(0, 'mutation score 92%\n');
    const result = await runTestIntelligence({
      projectDir: '/project', mutation: { enabled: true, command: 'stryker', args: ['run'], timeoutSeconds: 30 }, spawn,
    });
    expect(result.mutation).toEqual({ status: 'passed', summary: 'mutation score 92%', exitCode: 0 });
    expect(spawn).toHaveBeenCalledWith('stryker', ['run'], expect.objectContaining({ cwd: '/project' }));
  });

  it('verifies golden files by sha256 and detects changes', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'dev-loop-golden-')); dirs.push(dir);
    writeFileSync(path.join(dir, 'snapshot.txt'), 'expected');
    const sha256 = createHash('sha256').update('expected').digest('hex');
    const passed = await runTestIntelligence({ projectDir: dir, goldenFiles: [{ file: 'snapshot.txt', sha256 }] });
    expect(passed.golden.status).toBe('passed');
    writeFileSync(path.join(dir, 'snapshot.txt'), 'changed');
    const failed = await runTestIntelligence({ projectDir: dir, goldenFiles: [{ file: 'snapshot.txt', sha256 }] });
    expect(failed.golden).toMatchObject({ status: 'failed', mismatches: ['snapshot.txt'] });
  });
});
