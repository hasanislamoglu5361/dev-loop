import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { closeDatabase, initDatabase } from '../db/connection.js';
import { getLearningContext, recordVerifiedLearning } from '../db/queries/learning-patterns.js';

const dirs: string[] = [];
afterEach(() => { closeDatabase(); dirs.splice(0).forEach(dir => rmSync(dir, { recursive: true, force: true })); });

describe('FEATURE112 closed learning loop', () => {
  it('records verified outcomes exactly once across retries', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'dev-loop-learning-')); dirs.push(dir);
    initDatabase(path.join(dir, 'db.sqlite'));
    const first = recordVerifiedLearning({ loopId: 7, model: 'm1', provider: 'fake', featureId: 'FEATURE-X', turns: 2, fallbackUsed: false });
    const retry = recordVerifiedLearning({ loopId: 7, model: 'm1', provider: 'fake', featureId: 'FEATURE-X', turns: 2, fallbackUsed: false });
    expect(first.created).toBe(true); expect(retry).toEqual({ id: first.id, created: false });
  });

  it('returns learned outcomes for later matching contexts only', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'dev-loop-learning-')); dirs.push(dir);
    initDatabase(path.join(dir, 'db.sqlite'));
    recordVerifiedLearning({ loopId: 1, model: 'm1', featureId: 'FEATURE-X', turns: 3, fallbackUsed: true });
    expect(getLearningContext('m1', 'FEATURE-X')).toEqual(['fallback_verified completed in 3 turn(s)']);
    expect(getLearningContext('other', 'FEATURE-X')).toEqual([]);
  });
});
